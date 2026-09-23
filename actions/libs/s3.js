// Presign-proxy client for external S3 uploads — used only where the
// destination service (Firefly's /v2/harmonize-image) validates the domain
// behind a presigned URL and rejects this project's own Adobe I/O Files
// storage (see actions/libs/storage.js) with "Domain not allowed". The proxy
// service does the actual AWS signing; this only ever holds the AWS
// credentials (from .env) and never forwards them to the browser.
async function getPresignedUrl (env, fileName, operation) {
  const resp = await fetch(env.S3_PRESIGN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_key_id: env.S3_ACCESS_KEY,
      secret_access_key: env.S3_SECRET_KEY,
      bucketName: env.S3_BUCKET,
      region: env.S3_REGION,
      fileName,
      operation
    })
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Presign service error (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  if (!data.url) throw new Error('Presign service returned no URL')
  return data.url
}

async function getUploadUrls (env, relativePath) {
  const [putUrl, getUrl] = await Promise.all([
    getPresignedUrl(env, relativePath, 'putObject'),
    getPresignedUrl(env, relativePath, 'getObject')
  ])
  return { putUrl, getUrl }
}

module.exports = { getUploadUrls }
