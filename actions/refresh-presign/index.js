const { ok, badRequest, serverError } = require('../libs/http')
const { getFreshReadUrl } = require('../libs/s3')

async function main (params) {
  const { key } = params

  if (!key) return badRequest('key is required')

  try {
    const presignedUrl = await getFreshReadUrl(params, key)
    return ok({ ok: true, presignedUrl, storageType: 'AWS' })
  } catch (e) {
    return serverError(e.message)
  }
}

exports.main = main
