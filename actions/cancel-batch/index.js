const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const CANCEL_URL = (batchId) => `https://run-workflow.adobe.io/batch/${batchId}/cancel`

async function main (params) {
  const logger = Core.Logger('cancel-batch', { level: params.LOG_LEVEL || 'info' })
  const { batchId } = params

  if (!batchId) return badRequest('batchId is required')

  try {
    const response = await fetch(CANCEL_URL(batchId), {
      method: 'POST',
      headers: await buildWorkflowHeaders(params)
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`Cancel batch returned ${response.status}`)
      return serverError('Could not cancel the batch. Please try again.')
    }

    return ok({ ok: true, result: data })
  } catch (e) {
    logger.error(e.message)
    return serverError('Could not cancel the batch. Please try again.')
  }
}

exports.main = main
