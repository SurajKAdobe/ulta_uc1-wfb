const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')
const { stripBloat } = require('../libs/slimStatus')

const EXECUTIONS_URL = (batchId) => `https://run-workflow.adobe.io/batch/${batchId}/executions`

async function main (params) {
  const logger = Core.Logger('check-executions', { level: params.LOG_LEVEL || 'info' })
  const { batchId } = params

  if (!batchId) return badRequest('batchId is required')

  try {
    const response = await fetch(EXECUTIONS_URL(batchId), {
      method: 'GET',
      headers: await buildWorkflowHeaders(params)
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`Executions check returned ${response.status}`)
      return serverError('Could not retrieve execution details. Please try again.')
    }

    return ok({ ok: true, executions: stripBloat(data) })
  } catch (e) {
    logger.error(e.message)
    return serverError('Could not retrieve execution details. Please try again.')
  }
}

exports.main = main
