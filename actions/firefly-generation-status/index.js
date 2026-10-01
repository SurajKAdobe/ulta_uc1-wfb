const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { buildFireflyHeaders, parseResponse } = require('../libs/firefly')
const { getUploadUrls, getFreshReadUrl } = require('../libs/storage')

const TERMINAL_SUCCESS = new Set(['complete', 'completed', 'succeeded', 'success', 'succeeded_with_warnings'])
const TERMINAL_FAILURE = new Set(['failed', 'error', 'cancelled', 'canceled'])

function imageUrlFrom (data) {
  const candidates = [
    data?.outputs?.[0]?.image,
    data?.outputs?.[0]?.image?.url,
    data?.outputs?.[0]?.imageUrl,
    data?.outputs?.[0]?.url,
    data?.result?.output?.image?.url,
    data?.result?.output?.url,
    data?.result?.outputs?.[0]?.image?.url,
    data?.result?.outputs?.[0]?.url,
    data?.result?.images?.[0]?.url,
    data?.variations?.[0]?.url,
    data?.images?.[0]?.url,
    data?.image?.url
  ]
  return candidates.find((url) => typeof url === 'string' && url.startsWith('https://')) || null
}

async function persistGeneratedImage (imageUrl, params, jobId) {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Could not download the Firefly result (${response.status})`)
  const contentType = response.headers.get('content-type') || 'image/png'
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType.split(';')[0].toLowerCase())) {
    throw new Error(`Firefly returned an unsupported image type (${contentType})`)
  }
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > 25 * 1024 * 1024) throw new Error('Firefly image exceeds 25 MB')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 25 * 1024 * 1024) throw new Error('Firefly image exceeds 25 MB')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.length === 0) throw new Error('Firefly returned an empty image')

  const extension = contentType.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || 'png'
  const safeJobId = jobId.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `generated-backgrounds/${safeJobId}.${extension}`
  const { putUrl } = await getUploadUrls(key)
  const upload = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: bytes
  })
  if (!upload.ok) throw new Error(`Could not save the Firefly result in app storage (${upload.status})`)
  return { key, url: await getFreshReadUrl(key), contentType }
}

async function main (params) {
  const logger = Core.Logger('firefly-generation-status', { level: params.LOG_LEVEL || 'info' })
  const { jobId, statusUrl } = params
  if (typeof jobId !== 'string' || !/^[a-zA-Z0-9._:-]{1,200}$/.test(jobId) ||
      typeof statusUrl !== 'string' || statusUrl.length > 2048) {
    return badRequest('A valid Firefly jobId and statusUrl are required')
  }

  let parsedStatusUrl
  try {
    parsedStatusUrl = new URL(statusUrl)
  } catch {
    return badRequest('statusUrl must be a valid HTTPS Firefly status URL')
  }
  const approvedHost = parsedStatusUrl.hostname === 'firefly-api.adobe.io' ||
    /^firefly-[a-z0-9-]+\.adobe\.io$/i.test(parsedStatusUrl.hostname)
  if (parsedStatusUrl.protocol !== 'https:' || parsedStatusUrl.port || parsedStatusUrl.username ||
      parsedStatusUrl.password || parsedStatusUrl.hash || !approvedHost ||
      !/^\/v[34]\/status\/.+/.test(parsedStatusUrl.pathname)) {
    return badRequest('statusUrl must be an HTTPS Firefly status URL')
  }

  try {
    const response = await fetch(parsedStatusUrl, {
      headers: await buildFireflyHeaders(params)
    })
    const data = await parseResponse(response, 'Firefly generation status')
    const status = String(data?.status || data?.jobStatus || data?.job?.status || 'pending').toLowerCase()
    if (TERMINAL_FAILURE.has(status)) {
      throw new Error(data?.error?.message || data?.message || `Firefly generation ${status}`)
    }
    const imageUrl = imageUrlFrom(data)
    if (imageUrl) {
      const stored = await persistGeneratedImage(imageUrl, params, jobId)
      return ok({ ok: true, status: 'completed', ...stored, fileName: `Firefly background.${stored.contentType.split('/')[1]?.split(';')[0] || 'png'}` })
    }
    if (TERMINAL_SUCCESS.has(status)) throw new Error('Firefly completed the job but returned no image URL')
    return ok({ ok: true, status, message: data?.message || null })
  } catch (error) {
    logger.error(`Firefly generation status failed for ${jobId}: ${error.message}`)
    return serverError(error.message)
  }
}

exports.main = withCors(main)
