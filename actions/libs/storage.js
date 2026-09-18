const filesLib = require('@adobe/aio-lib-files')

// Same presign pattern the old S3-presign-proxy version used: this only ever
// hands the browser a presigned URL, never file bytes or credentials — but
// backed by this App Builder project's own Adobe I/O Files storage instead of
// an external S3 bucket/proxy service. filesLib.init() with no args picks up
// the __OW_API_KEY/__OW_NAMESPACE credentials Adobe I/O Runtime (and
// `aio app dev` locally) already injects into every action, so no separate
// storage credentials need to be provisioned or held in .env.
const EXPIRY_SECONDS = 4 * 60 * 60

async function getPresignedUrl (relativePath, permissions) {
  const files = await filesLib.init()
  return files.generatePresignURL(relativePath, { expiryInSeconds: EXPIRY_SECONDS, permissions })
}

async function getUploadUrls (relativePath) {
  const [putUrl, getUrl] = await Promise.all([
    getPresignedUrl(relativePath, 'w'),
    getPresignedUrl(relativePath, 'r')
  ])
  return { putUrl, getUrl }
}

// URLs expire (EXPIRY_SECONDS) — call this right before submitting to Workflow
// Builder rather than reusing the URL handed back at upload time, since an
// upload can sit in the browser for a while before Execute is actually clicked.
async function getFreshReadUrl (relativePath) {
  return getPresignedUrl(relativePath, 'r')
}

module.exports = { getUploadUrls, getFreshReadUrl }
