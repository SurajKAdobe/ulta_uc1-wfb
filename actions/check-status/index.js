const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')
const { stripBloat } = require('../libs/slimStatus')

// format=preview asks Workflow Builder to include completed output nodes'
// content (presigned URLs to the produced assets) in the status response —
// without it, status only reports counts/timing, no way to view what was made.
const STATUS_URL = (batchId) => `https://run-workflow.adobe.io/batch/${batchId}/status?format=preview`

async function main (params) {
  const logger = Core.Logger('check-status', { level: params.LOG_LEVEL || 'info' })
  const { batchId } = params

  if (!batchId) return badRequest('batchId is required')

  try {
    const response = await fetch(STATUS_URL(batchId), {
      method: 'GET',
      headers: await buildWorkflowHeaders(params)
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`Status check returned ${response.status}`)
      return serverError('Could not retrieve workflow status. Please try again.')
    }

    return ok({ ok: true, status: stripBloat(data) })
  } catch (e) {
    logger.error(e.message)
    return serverError('Could not retrieve workflow status. Please try again.')
  }
}

exports.main = main
