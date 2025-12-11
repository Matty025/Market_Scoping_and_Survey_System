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
  await containerClient.createIfNotExists({ access: 'container' }).catch(() => {});
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

module.exports = { uploadBuffer, generateSasUrl, blobServiceClient };
