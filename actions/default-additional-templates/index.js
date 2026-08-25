const { Core } = require('@adobe/aio-sdk')
const { ok, serverError } = require('../libs/http')
const { getFreshReadUrl } = require('../libs/s3')

// Uploaded once via a one-off script to these fixed S3 keys — this action only ever
// re-presigns a fresh read URL for them, it never re-uploads. Order/ids must match
// web-src/src/components/TemplateGrid/TemplateGrid.js's ADDITIONAL_TEMPLATES.
const TEMPLATES = [
  { id: 'tpl-1sku-960x768', fileName: 'UC1 - Promo Card - 1 SKU.psd' },
  { id: 'tpl-1sku-1500x896', fileName: 'UC1-Promo-Card-1-SKU-4x_FS_1500x896.psd' },
  { id: 'tpl-1sku-1500x1500', fileName: 'UC1-Promo-Card-1-SKU-4x_FS_1500x1500.psd' },
  { id: 'tpl-2sku-960x768', fileName: 'UC1 - Promo Card - 2 SKU.psd' },
  { id: 'tpl-2sku-1500x896', fileName: 'UC1-Promo-Card-2-SKU-4x_1500x896.psd' },
  { id: 'tpl-2sku-1500x1500', fileName: 'UC1-Promo-Card-2-SKU-4x_1500x1500.psd' }
]

const keyFor = (id) => `defaults/additional-templates/${id}.psd`

async function main (params) {
  const logger = Core.Logger('default-additional-templates', { level: params.LOG_LEVEL || 'info' })

  try {
    const templates = await Promise.all(TEMPLATES.map(async (t) => ({
      id: t.id,
      fileName: t.fileName,
      storageType: 'AWS',
      key: keyFor(t.id),
      presignedUrl: await getFreshReadUrl(params, keyFor(t.id))
    })))

    return ok({ ok: true, templates })
  } catch (e) {
    logger.error(e.message)
    return serverError('Could not load the default additional templates.')
  }
}

exports.main = main
