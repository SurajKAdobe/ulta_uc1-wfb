const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'

// UC4_input.csv has no header row (see web-src/src/utils/csv.js parseUc4Csv) —
// column indices inferred from a real sample file, not confirmed against a
// spec:
//   0: offer name/description (e.g. "VD002 - DIBS Beauty Valid Offer") — NOT used
//   1: comma-separated SKU ids (e.g. "2648164, 2648170, ...")
//   2: status (e.g. "Ready for review")
//   3: background image URL (externally hosted, e.g. monday.com) — NOT used
//      (see backgroundImagePresignedUrl below): it's a protected asset that
//      406s when this app's backend tries to fetch it server-side, so the user
//      uploads the background image manually instead
//   4: template name (e.g. "BSBS_Test_Headers_SR_FINAL")
const COL = { offerName: 0, skus: 1, status: 2, imageUrl: 3, template: 4 }

// Hardcoded per instruction — node 4 is a color field, always white.
// (Confirmed by a real failed batch run: node 4's downstream step errored
// "Invalid URL: #FFFFFF" and node 8's errored "Missing required input:
// productImages" — the two were swapped from the original guess.)
const WHITE_HEX = '#FFFFFF'

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
function validate ({ rows, backgroundImagePresignedUrl, templatePsdPresignedUrl }, params) {
  if (!Array.isArray(rows) || rows.length === 0) return 'rows must be a non-empty array of CSV records'
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

function buildInputs (rows, backgroundImagePresignedUrl, templatePsdPresignedUrl, params) {
  const rowImageFile = [{ presignedUrl: backgroundImagePresignedUrl, name: 'background.jpg', storageType: 'AWS' }]

  return rows.map((row) => {
    const skuUrls = parseSkus(row[COL.skus]).map(PRODUCT_IMAGE_URL).join(',')

    return [
      { node_id: params.UC4_INPUT_IMAGE_NODE_ID, content: { presignedUrl: templatePsdPresignedUrl, storageType: 'AWS' } },
      { node_id: params.UC4_INPUT_ROW_IMAGE_NODE_ID, content: rowImageFile },
      { node_id: params.UC4_INPUT_COLOR_NODE_ID, content: WHITE_HEX },
      { node_id: params.UC4_INPUT_SKU_URLS_NODE_ID, content: skuUrls }
    ]
  })
}

async function main (params) {
  const logger = Core.Logger('execute-uc4-workflow', { level: params.LOG_LEVEL || 'info' })
  const { rows, backgroundImagePresignedUrl, templatePsdPresignedUrl } = params

  const validationError = validate({ rows, backgroundImagePresignedUrl, templatePsdPresignedUrl }, params)
  if (validationError) return badRequest(validationError)

  try {
    const inputs = buildInputs(rows, backgroundImagePresignedUrl, templatePsdPresignedUrl, params)

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
