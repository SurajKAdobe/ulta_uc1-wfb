const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'

// UC4_input.csv now has a header row — the frontend locates the Image/SKU
// columns by alias match and validates both are present (see
// web-src/src/utils/csv.js parseUc4Csv), then sends the resolved SKU column's
// index here rather than this action guessing a fixed position. The Image
// column itself isn't consumed here — the background image comes from a
// manual upload instead (see backgroundImagePresignedUrl below), the CSV's
// own image column is just required to exist as a schema check.
// node 4 is a color field, white by default if the caller doesn't send one
// (confirmed by a real failed batch run: node 4's downstream step errored
// "Invalid URL: #FFFFFF" and node 8's errored "Missing required input:
// productImages" — the two were swapped from the original guess).
const DEFAULT_COLOR_HEX = '#FFFFFF'

// Verified live (curl'd it — real image, 200, image/png, CORS-open) — Ulta's
// public product image CDN, one image per SKU id. Passed as plain text (node 4
// is a text field, not a file), so Workflow Builder's file-URL host allowlist
// (amazonaws.com, adobe.io, etc. — confirmed live, media.ultainc.com 400s as a
// file input) doesn't apply here.
const PRODUCT_IMAGE_URL = (sku) => `https://media.ultainc.com/i/ulta/${sku}`

// The real Workflow Builder graph (updated per WFB fixes) has 4 input nodes:
//   1 (UC4_INPUT_IMAGE_NODE_ID)    — a single file — the template PSD the user
//                                    uploads (see Uc4PsdUpload), reused for every row
//   3 (UC4_INPUT_ROW_IMAGE_NODE_ID) — array of files (1 entry) — the background
//                                    image the user uploads (see Uc4ImageUpload),
//                                    reused for every row
//   4 (UC4_INPUT_COLOR_NODE_ID)    — a text field — hardcoded white hex color
//   8 (UC4_INPUT_SKU_URLS_NODE_ID) — a text field — comma-separated Ulta CDN
//                                    product image URLs for the row's SKUs
function validate ({ rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl }, params) {
  if (!Array.isArray(rows) || rows.length === 0) return 'rows must be a non-empty array of CSV records'
  if (typeof skuColumnIndex !== 'number' || skuColumnIndex < 0) return 'skuColumnIndex is required'
  if (!backgroundImagePresignedUrl) return 'backgroundImagePresignedUrl is required'
  if (!templatePsdPresignedUrl) return 'templatePsdPresignedUrl is required'
  if (!params.UC4_WORKFLOW_ID) return 'UC4_WORKFLOW_ID is not configured'
  if (!params.UC4_INPUT_IMAGE_NODE_ID || !params.UC4_INPUT_ROW_IMAGE_NODE_ID || !params.UC4_INPUT_SKU_URLS_NODE_ID || !params.UC4_INPUT_COLOR_NODE_ID) {
    return 'UC4 workflow input node ids are not fully configured'
  }
  return null
}

function parseSkus (cell) {
  return String(cell || '').split(',').map((s) => s.trim()).filter(Boolean)
}

function buildInputs (rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex, params) {
  const rowImageFile = [{ presignedUrl: backgroundImagePresignedUrl, name: 'background.jpg', storageType: 'AWS' }]

  return rows.map((row) => {
    const skuUrls = parseSkus(row[skuColumnIndex]).map(PRODUCT_IMAGE_URL).join(',')

    return [
      { node_id: params.UC4_INPUT_IMAGE_NODE_ID, content: { presignedUrl: templatePsdPresignedUrl, storageType: 'AWS' } },
      { node_id: params.UC4_INPUT_ROW_IMAGE_NODE_ID, content: rowImageFile },
      { node_id: params.UC4_INPUT_COLOR_NODE_ID, content: colorHex || DEFAULT_COLOR_HEX },
      { node_id: params.UC4_INPUT_SKU_URLS_NODE_ID, content: skuUrls }
    ]
  })
}

async function main (params) {
  const logger = Core.Logger('execute-uc4-workflow', { level: params.LOG_LEVEL || 'info' })
  const { rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex } = params

  const validationError = validate({ rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl }, params)
  if (validationError) return badRequest(validationError)

  try {
    const inputs = buildInputs(rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex, params)

    const response = await fetch(WORKFLOW_API_URL, {
      method: 'POST',
      headers: await buildWorkflowHeaders(params, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        workflow: { workflowId: params.UC4_WORKFLOW_ID, inputs }
      })
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`UC4 Workflow Builder returned ${response.status}: ${JSON.stringify(data)}`)
      return serverError('UC4 workflow execution failed. We were unable to submit the workflow. Please try again.')
    }

    return ok({ ok: true, batchId: data?.batchId, submission: data })
  } catch (e) {
    logger.error(e.message)
    return serverError(`UC4 workflow execution failed: ${e.message}`)
  }
}

exports.main = main
