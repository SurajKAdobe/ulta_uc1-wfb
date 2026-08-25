const { ok, badRequest } = require('../libs/http')
const { buildWorkflowInputs } = require('../libs/workflowPayload')

function validate ({ rows, templatePresignedUrl, additionalTemplatePresignedUrls }) {
  if (!Array.isArray(rows) || rows.length === 0) return 'rows must be a non-empty array of CSV records'
  if (!templatePresignedUrl) return 'templatePresignedUrl is required'
  if (!Array.isArray(additionalTemplatePresignedUrls) || additionalTemplatePresignedUrls.length !== 6) {
    return 'additionalTemplatePresignedUrls must be an array of exactly 6 presigned URLs'
  }
  return null
}

// Mirrors execute-workflow's validation/payload construction exactly (same
// buildWorkflowInputs call) but never calls run-workflow.adobe.io and never
// touches ACCESS_TOKEN/API_KEY — this is display-only, so the preview can't
// drift from what execute-workflow actually sends, and no secret is at risk.
async function main (params) {
  const { rows, templatePresignedUrl, additionalTemplatePresignedUrls } = params

  const validationError = validate({ rows, templatePresignedUrl, additionalTemplatePresignedUrls })
  if (validationError) return badRequest(validationError)

  const inputs = buildWorkflowInputs({
    rows,
    templatePresignedUrl,
    additionalTemplatePresignedUrls,
    templateNodeId: params.WORKFLOW_TEMPLATE_NODE_ID,
    additionalTemplateNodeIds: (params.WORKFLOW_ADDITIONAL_TEMPLATE_NODE_IDS || '').split(','),
    skuNodeId: params.WORKFLOW_SKU_NODE_ID,
    filenameNodeId: params.WORKFLOW_FILENAME_NODE_ID,
    backgroundNodeId: params.WORKFLOW_BACKGROUND_NODE_ID,
    templateSizeNodeId: params.WORKFLOW_TEMPLATE_SIZE_NODE_ID
  })

  return ok({
    ok: true,
    url: 'https://run-workflow.adobe.io/batch/execute',
    body: { workflow: { workflowId: params.WORKFLOW_ID, inputs } }
  })
}

exports.main = main
