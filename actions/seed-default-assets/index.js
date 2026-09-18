const filesLib = require('@adobe/aio-lib-files')
const { ok, badRequest, serverError, withCors } = require('../libs/http')

// Mints a *write* presigned URL for one of a fixed, whitelisted set of default
// template/background keys (never an arbitrary caller-supplied path — this
// would otherwise be an unauthenticated "write anywhere in our storage"
// endpoint). The actual file bytes never pass through this action: PSD
// templates here run up to ~16MB, well past Adobe I/O Runtime's web action
// payload limit, so the caller (scripts/seed-once.js) PUTs bytes straight to
// the returned URL, the same presign-then-PUT pattern uploadService.js uses
// for user uploads.
//
// Keys/filenames must match actions/default-additional-templates/index.js's
// TEMPLATES array and services/uploadService.js's DEFAULT_TEMPLATE_KEY.
const ALLOWED_KEYS = new Set([
  'defaults/primary-template/bg_change.psd',
  'defaults/additional-templates/tpl-1sku-960x768.psd',
  'defaults/additional-templates/tpl-1sku-1500x896.psd',
  'defaults/additional-templates/tpl-1sku-1500x1500.psd',
  'defaults/additional-templates/tpl-2sku-960x768.psd',
  'defaults/additional-templates/tpl-2sku-1500x896.psd',
  'defaults/additional-templates/tpl-2sku-1500x1500.psd',
  'defaults/uc4-background/bg.jpg'
])

async function main (params) {
  const { key } = params

  if (!ALLOWED_KEYS.has(key)) {
    return badRequest(`key must be one of: ${[...ALLOWED_KEYS].join(', ')}`)
  }

  try {
    const files = await filesLib.init()
    const putUrl = await files.generatePresignURL(key, { expiryInSeconds: 4 * 60 * 60, permissions: 'w' })
    return ok({ ok: true, putUrl })
  } catch (e) {
    return serverError(e.message)
  }
}

exports.main = withCors(main)
