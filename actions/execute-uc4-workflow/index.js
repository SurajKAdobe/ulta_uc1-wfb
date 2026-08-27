const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'

// UC4_input.csv has no header row (see web-src/src/utils/csv.js parseUc4Csv) —
// column indices inferred from a real sample file, not confirmed against a
// spec:
//   0: offer name/description (e.g. "VD002 - DIBS Beauty Valid Offer") — NOT
//      used (see WHITE_HEX below): node 4 is a hardcoded color, not this text
//   1: comma-separated SKU ids (e.g. "2648164, 2648170, ...")
//   2: status (e.g. "Ready for review")
//   3: background image URL (externally hosted, e.g. monday.com) — NOT used
//      (see backgroundImagePresignedUrl below): it's a protected asset that
//      406s when this app's backend tries to fetch it server-side, so the user
//      uploads the background image manually instead
//   4: template name (e.g. "BSBS_Test_Headers_SR_FINAL")
const COL = { offerName: 0, skus: 1, status: 2, imageUrl: 3, template: 4 }

// Hardcoded per instruction — node 4 is a color field, always white.
const WHITE_HEX = '#FFFFFF'

// Verified live (curl'd it — real image, 200, image/png, CORS-open) — Ulta's
// public product image CDN, one image per SKU id.
const PRODUCT_IMAGE_URL = (sku) => `https://media.ultainc.com/i/ulta/${sku}`

// The real Workflow Builder graph has 4 input nodes, all wired:
//   1 (this one) — a single file: { presignedUrl, storageType } — the template
//                  PSD the user uploads (see Uc4PsdUpload), reused for every row
//   2 (this one) — array of files: one per SKU's product image
//   3 (this one) — array of files (1 entry): the background image the user
//                  uploaded (see Uc4ImageUpload), reused for every row —
//                  originally tried deriving this from the CSV's own image-url
//                  column, but that URL is a protected monday.com asset our
//                  backend can't fetch (406)
//   4 (this one) — a single text field — hardcoded white hex color
function validate ({ rows, backgroundImagePresignedUrl, templatePsdPresignedUrl }, params) {
  if (!Array.isArray(rows) || rows.length === 0) return 'rows must be a non-empty array of CSV records'
  if (!backgroundImagePresignedUrl) return 'backgroundImagePresignedUrl is required'
  if (!templatePsdPresignedUrl) return 'templatePsdPresignedUrl is required'
  if (!params.UC4_WORKFLOW_ID) return 'UC4_WORKFLOW_ID is not configured'
  if (!params.UC4_INPUT_IMAGE_NODE_ID || !params.UC4_INPUT_TEXT_NODE_ID || !params.UC4_INPUT_SKU_FILES_NODE_ID || !params.UC4_INPUT_ROW_IMAGE_NODE_ID) {
    return 'UC4 workflow input node ids are not fully configured'
  }
  return null
}

function parseSkus (cell) {
  return String(cell || '').split(',').map((s) => s.trim()).filter(Boolean)
}

// ponytail: content.storageType is 'AWS' on every other node here because
// those are real S3 presigned URLs; these are direct Ulta CDN links (same
// public/CORS-open URL confirmed live), no re-hosting round trip needed.
// Flagging in case Workflow Builder turns out to require storageType to
// actually match the URL's host (untested — no rejection observed yet).
function buildInputs (rows, backgroundImagePresignedUrl, templatePsdPresignedUrl, params) {
  const rowImageFile = [{ presignedUrl: backgroundImagePresignedUrl, name: 'background.jpg', storageType: 'AWS' }]

  return rows.map((row) => {
    const skus = parseSkus(row[COL.skus])
    const productFiles = skus.map((sku) => ({ presignedUrl: PRODUCT_IMAGE_URL(sku), name: `${sku}.png`, storageType: 'AWS' }))

    return [
      { node_id: params.UC4_INPUT_IMAGE_NODE_ID, content: { presignedUrl: templatePsdPresignedUrl, storageType: 'AWS' } },
      { node_id: params.UC4_INPUT_SKU_FILES_NODE_ID, content: productFiles },
      { node_id: params.UC4_INPUT_ROW_IMAGE_NODE_ID, content: rowImageFile },
      { node_id: params.UC4_INPUT_TEXT_NODE_ID, content: WHITE_HEX }
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
