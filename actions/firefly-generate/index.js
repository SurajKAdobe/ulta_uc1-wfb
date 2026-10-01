const { Core } = require('@adobe/aio-sdk')
const { badRequest, ok, serverError, withCors } = require('../libs/http')
const { FIREFLY_API, ULTA_UC4_CUSTOM_MODEL_ID, buildFireflyHeaders, parseResponse } = require('../libs/firefly')

async function main (params) {
  const logger = Core.Logger('firefly-generate', { level: params.LOG_LEVEL || 'info' })
  const { prompt } = params
  if (typeof prompt !== 'string' || !prompt.trim()) return badRequest('prompt is required')
  if (prompt.length > 1500) return badRequest('prompt must be 1500 characters or fewer')

  try {
    const response = await fetch(`${FIREFLY_API}/v4/images/generate-async`, {
      method: 'POST',
      headers: await buildFireflyHeaders(params, {
        'content-type': 'application/json',
        'x-model-version': 'image5'
      }),
      body: JSON.stringify({
        prompt: prompt.trim(),
        aspectRatio: '4:3',
        resolutionLevel: '2.4MP',
        modelId: 'firefly_image',
        customModelId: ULTA_UC4_CUSTOM_MODEL_ID,
        numVariations: 1,
        seeds: [require('crypto').randomInt(1, 2147483647)],
        modelSpecificPayload: {
          localeCode: 'en-US',
          prompt_reasoner: 'quality'
        },
        referenceBlobs: []
      })
    })
    const data = await parseResponse(response, 'Firefly image generation')
    const statusUrl = data?.statusUrl || data?.status_url || data?.links?.result?.href
    const jobId = data?.jobId || data?.job?.id || data?.id ||
      (typeof statusUrl === 'string' ? new URL(statusUrl).pathname.split('/').filter(Boolean).pop() : null)
    if (!jobId || !statusUrl) throw new Error('Firefly accepted the request without returning a job id and status URL')
    return ok({ ok: true, jobId, statusUrl, status: data.status || 'pending' })
  } catch (error) {
    logger.error(`Firefly generation submission failed: ${error.message}`)
    return serverError(error.message)
  }
}

exports.main = withCors(main)
