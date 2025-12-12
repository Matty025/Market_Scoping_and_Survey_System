const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

function parseConnectionString(conn) {
  if (!conn || typeof conn !== 'string') return {};
  const parts = conn.split(';').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  return { accountName: parts.AccountName, accountKey: parts.AccountKey };
}

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || null;
if (!connectionString) {
  console.warn('[azureBlob] No AZURE_STORAGE_CONNECTION_STRING configured');
}

const blobServiceClient = connectionString ? BlobServiceClient.fromConnectionString(connectionString) : null;
const { accountName, accountKey } = parseConnectionString(connectionString || '');
const sharedKeyCredential = accountName && accountKey ? new StorageSharedKeyCredential(accountName, accountKey) : null;

async function uploadBuffer(containerName, blobName, buffer, contentType = 'application/octet-stream') {
  if (!blobServiceClient) throw new Error('Azure BlobServiceClient not configured');
  const containerClient = blobServiceClient.getContainerClient(containerName);
  
  // FIXED: Remove public access - use private container
  await containerClient.createIfNotExists().catch(() => {});
  
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
  return blockBlobClient.url;
}

function generateSasUrl(containerName, blobName, expiresMinutes = 15) {
  if (!sharedKeyCredential) throw new Error('Storage account key required for SAS generation');
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiresMinutes * 60 * 1000);
  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'),
    startsOn,
    expiresOn,
  }, sharedKeyCredential).toString();
  const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
  return url;
}

// NEW: Download blob as stream
async function downloadBlob(containerName, blobName) {
  if (!blobServiceClient) throw new Error('Azure BlobServiceClient not configured');
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);
  
  // Check if blob exists
  const exists = await blobClient.exists();
  if (!exists) {
    throw new Error(`Blob not found: ${containerName}/${blobName}`);
  }
  
  return await blobClient.download();
}

// NEW: Check if blob exists
async function blobExists(containerName, blobName) {
  if (!blobServiceClient) return false;
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);
  return await blobClient.exists();
}

module.exports = { 
  uploadBuffer, 
  generateSasUrl, 
  downloadBlob, 
  blobExists, 
  blobServiceClient 
};