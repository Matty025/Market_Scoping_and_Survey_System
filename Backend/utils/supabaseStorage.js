const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultBucket = process.env.SUPABASE_STORAGE_BUCKET || 'pdfs';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('[supabaseStorage] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Storage uploads will be disabled.');
}

const supabase = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const normalizePath = (p = '') => p.replace(/^\/+/, '');

const unwrapPath = (p = '') => {
  if (!p) return p;

  // Case 1: full Supabase URL
  try {
    const url = new URL(p);
    const match = url.pathname.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (match) {
      const [, bucket, key] = match;
      return { bucket, key };
    }
  } catch (_) {
    // not a URL
  }

  // Case 2: bucket/key string (e.g., "pdfs/path/to/file")
  const parts = normalizePath(p).split('/');
  if (parts.length > 1) {
    const [bucket, ...rest] = parts;
    return { bucket, key: rest.join('/') };
  }

  // Case 3: plain key, use default bucket
  return { bucket: defaultBucket, key: normalizePath(p) };
};

async function uploadBuffer(blobPath, buffer, contentType = 'application/octet-stream', bucketName = defaultBucket) {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }
  const key = normalizePath(blobPath);
  const { error } = await supabase.storage.from(bucketName).upload(key, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw error;
  }
  // Store the key (bucket/path) so we can sign later without leaking base URL
  return `${bucketName}/${key}`;
}

async function deleteFile(blobPath) {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }
  const parsed = unwrapPath(blobPath);
  const bucketName = parsed.bucket || defaultBucket;
  const key = normalizePath(parsed.key || blobPath);
  const { error } = await supabase.storage.from(bucketName).remove([key]);
  if (error) {
    throw error;
  }
  return true;
}

async function generateSignedUrl(blobPath, expiresMinutes = 60) {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }
  const parsed = unwrapPath(blobPath);
  const bucketName = parsed.bucket || defaultBucket;
  const key = normalizePath(parsed.key || blobPath);
  const expiresIn = Math.max(60, Math.floor(expiresMinutes * 60));
  const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(key, expiresIn);
  if (error) {
    throw error;
  }
  return data.signedUrl;
}

async function downloadFile(blobPath) {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }
  const parsed = unwrapPath(blobPath);
  const bucketName = parsed.bucket || defaultBucket;
  const key = normalizePath(parsed.key || blobPath);
  const url = await generateSignedUrl(`${bucketName}/${key}`, 15);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  return response.body; // Readable stream
}

module.exports = {
  supabase,
  uploadBuffer,
  deleteFile,
  generateSignedUrl,
  downloadFile,
};
