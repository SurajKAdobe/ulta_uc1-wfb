const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { getFreshReadUrl } = require('../libs/storage')

async function main (params) {
  const { key } = params

  if (!key) return badRequest('key is required')

  try {
    const presignedUrl = await getFreshReadUrl(key)
    return ok({ ok: true, presignedUrl, storageType: 'ADOBE_IO_FILES' })
  } catch (e) {
    return serverError(e.message)
  }
}

exports.main = withCors(main)
