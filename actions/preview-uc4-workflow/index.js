const { ok, badRequest } = require('../libs/http')

// Same column indices as execute-uc4-workflow/index.js.
const COL = { offerName: 0, skus: 1, status: 2, imageUrl: 3, template: 4 }

const WHITE_HEX = '#FFFFFF'
const PRODUCT_IMAGE_URL = (sku) => `https://media.ultainc.com/i/ulta/${sku}`

function parseSkus (cell) {
  return String(cell || '').split(',').map((s) => s.trim()).filter(Boolean)
}

// Preview-only — never calls Workflow Builder. Mirrors execute-uc4-workflow's
// payload exactly — it's all synchronous data mapping now that node 4 is a
// plain comma-separated text field, no per-SKU file re-hosting to fake here.
function buildPreviewInputs (rows, backgroundImagePresignedUrl, templatePsdPresignedUrl, params) {
  return rows.map((row) => {
    const skuUrls = parseSkus(row[COL.skus]).map(PRODUCT_IMAGE_URL).join(',')

    return [
      { node_id: params.UC4_INPUT_IMAGE_NODE_ID, content: { presignedUrl: templatePsdPresignedUrl || '{presigned_url}', storageType: 'AWS' } },
      {
        node_id: params.UC4_INPUT_ROW_IMAGE_NODE_ID,
        content: [{ presignedUrl: backgroundImagePresignedUrl || '{presigned_url}', name: 'background image', storageType: 'AWS' }]
      },
      { node_id: params.UC4_INPUT_COLOR_NODE_ID, content: WHITE_HEX },
      { node_id: params.UC4_INPUT_SKU_URLS_NODE_ID, content: skuUrls }
    ]
  })
}

async function main (params) {
  const { rows, backgroundImagePresignedUrl, templatePsdPresignedUrl } = params
  if (!Array.isArray(rows) || rows.length === 0) return badRequest('rows must be a non-empty array of CSV records')

  const inputs = buildPreviewInputs(rows, backgroundImagePresignedUrl, templatePsdPresignedUrl, params)

  return ok({
    ok: true,
    url: 'https://run-workflow.adobe.io/batch/execute',
    body: { workflow: { workflowId: params.UC4_WORKFLOW_ID, inputs } }
  })
}

exports.main = main
