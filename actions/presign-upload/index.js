const { nanoid } = require('nanoid')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { getUploadUrls } = require('../libs/storage')

const ALLOWED_KINDS = new Set(['csv', 'psd', 'image', 'png', 'jpeg'])

function sanitizeFileName (name) {
  return String(name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function main (params) {
  const { kind, fileName } = params

  if (!ALLOWED_KINDS.has(kind)) {
    return badRequest(`kind must be one of: ${[...ALLOWED_KINDS].join(', ')}`)
  }
  if (!fileName) {
    return badRequest('fileName is required')
  }

  const relativePath = `uploads/${kind}/${Date.now()}-${nanoid(8)}-${sanitizeFileName(fileName)}`

  try {
    const { putUrl, getUrl } = await getUploadUrls(relativePath)
    return ok({ ok: true, putUrl, getUrl, storageType: 'ADOBE_IO_FILES', key: relativePath })
  } catch (e) {
    return serverError(e.message)
  }
}

exports.main = withCors(main)
