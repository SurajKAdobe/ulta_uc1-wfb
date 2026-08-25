const { Core } = require('@adobe/aio-sdk')
const { ok, serverError } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const BATCHES_URL = 'https://run-workflow.adobe.io/batches'

async function main (params) {
  const logger = Core.Logger('list-batches', { level: params.LOG_LEVEL || 'info' })

  try {
    const response = await fetch(BATCHES_URL, {
      method: 'GET',
      headers: await buildWorkflowHeaders(params)
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      logger.error(`List batches returned ${response.status}`)
      return serverError('Could not retrieve batch history. Please try again.')
    }

    return ok({ ok: true, batches: data })
  } catch (e) {
    logger.error(e.message)
    return serverError('Could not retrieve batch history. Please try again.')
  }
}

exports.main = main
