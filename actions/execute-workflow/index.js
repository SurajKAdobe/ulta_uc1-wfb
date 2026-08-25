const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowInputs } = require('../libs/workflowPayload')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'

function validate ({ rows, templatePresignedUrl, additionalTemplatePresignedUrls }) {
  if (!Array.isArray(rows) || rows.length === 0) return 'rows must be a non-empty array of CSV records'
  if (!templatePresignedUrl) return 'templatePresignedUrl is required'
  if (!Array.isArray(additionalTemplatePresignedUrls) || additionalTemplatePresignedUrls.length !== 6) {
    return 'additionalTemplatePresignedUrls must be an array of exactly 6 presigned URLs'
  }
  return null
}

async function main (params) {
  const logger = Core.Logger('execute-workflow', { level: params.LOG_LEVEL || 'info' })
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

  try {
    const response = await fetch(WORKFLOW_API_URL, {
      method: 'POST',
      headers: await buildWorkflowHeaders(params, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        workflow: { workflowId: params.WORKFLOW_ID, inputs }
      })
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`Workflow Builder returned ${response.status}`)
      return serverError('Workflow execution failed. We were unable to submit the workflow. Please try again.')
    }

    return ok({ ok: true, batchId: data?.batchId, submission: data })
  } catch (e) {
    logger.error(e.message)
    return serverError('Workflow execution failed. We were unable to submit the workflow. Please try again.')
  }
}

exports.main = main
