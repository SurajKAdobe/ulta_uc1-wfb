// Same presign-proxy pattern as pw-scripts' actions/upload/imageUpload.js:
// the proxy service does the actual S3 signing — this action only ever holds
// the AWS credentials (from .env) and never forwards them to the browser.
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

// The presign proxy's URLs expire (observed: 4h) — call this right before submitting
// to Workflow Builder rather than reusing the URL handed back at upload time, since
// an upload can sit in the browser for a while before Execute is actually clicked.
async function getFreshReadUrl (env, relativePath) {
  return getPresignedUrl(env, relativePath, 'getObject')
}

module.exports = { getUploadUrls, getFreshReadUrl }
