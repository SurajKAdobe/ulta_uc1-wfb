const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'

// UC2B: banner generation from a CSV + a PSD template. Unlike UC1/UC4 (one
// Workflow Builder execution per CSV row, submitted as N "variations" in the
// inputs array), this graph takes the whole CSV file as a single input and
// generates its banner(s) internally — one execution total, not one per row,
// so there's no per-row CSV parsing on this side at all.
//   1 (UC2B_INPUT_CSV_NODE_ID)      — a file — the CSV the user uploads as-is
//   4 (UC2B_INPUT_TEMPLATE_NODE_ID) — a template file — the banner PSD template
function validate ({ csvPresignedUrl, templatePsdPresignedUrl }, params) {
  if (!csvPresignedUrl) return 'csvPresignedUrl is required'
  if (!templatePsdPresignedUrl) return 'templatePsdPresignedUrl is required'
  if (!params.UC2B_WORKFLOW_ID) return 'UC2B_WORKFLOW_ID is not configured'
  if (!params.UC2B_INPUT_CSV_NODE_ID || !params.UC2B_INPUT_TEMPLATE_NODE_ID) {
    return 'UC2B workflow input node ids are not fully configured'
  }
  return null
}

function buildInputs (csvPresignedUrl, templatePsdPresignedUrl, params) {
  return [[
    { node_id: params.UC2B_INPUT_CSV_NODE_ID, content: [{ presignedUrl: csvPresignedUrl, storageType: 'AWS' }] },
    { node_id: params.UC2B_INPUT_TEMPLATE_NODE_ID, template: { presignedUrl: templatePsdPresignedUrl, storageType: 'AWS' } }
  ]]
}

async function main (params) {
  const logger = Core.Logger('execute-uc2b-workflow', { level: params.LOG_LEVEL || 'info' })
  const { csvPresignedUrl, templatePsdPresignedUrl } = params

  const validationError = validate({ csvPresignedUrl, templatePsdPresignedUrl }, params)
  if (validationError) return badRequest(validationError)

  try {
    const inputs = buildInputs(csvPresignedUrl, templatePsdPresignedUrl, params)

    const response = await fetch(WORKFLOW_API_URL, {
      method: 'POST',
      headers: await buildWorkflowHeaders(params, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        workflow: { workflowId: params.UC2B_WORKFLOW_ID, inputs }
      })
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`UC2B Workflow Builder returned ${response.status}: ${JSON.stringify(data)}`)
      return serverError('UC2B workflow execution failed. We were unable to submit the workflow. Please try again.')
    }

    return ok({ ok: true, batchId: data?.batchId, submission: data })
  } catch (e) {
    logger.error(e.message)
    return serverError(`UC2B workflow execution failed: ${e.message}`)
  }
}

exports.main = withCors(main)
