const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { getAccessToken } = require('../libs/imsAuth')
const { getUploadUrls } = require('../libs/s3')
const { buildForegroundMaskPng } = require('../libs/rasterMask')

const BASE_URL = 'https://photoshop-api.adobe.io'
const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 250000
const TERMINAL_SUCCESS = new Set(['succeeded'])
// Spec's status enum spells it 'cancelled'; some error bodies use 'canceled' —
// treating both as terminal-failure rather than trusting one spelling.
const TERMINAL_FAILURE = new Set(['failed', 'cancelled', 'canceled', 'timeout'])

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validate ({ presignedUrl, edits, documentWidth, documentHeight }) {
  if (!presignedUrl) return 'presignedUrl is required'
  if (!Array.isArray(edits) || edits.length === 0) return 'edits must be a non-empty array of { bounds, visible }'
  if (!documentWidth || !documentHeight) return 'documentWidth/documentHeight are required to build the foreground mask'
  return null
}

// This is a separate Firefly Services credential from the rest of the
// Photoshop v2 actions (psd-composite/psd-manifest use IMS_OAUTH_S2S_*) — the
// values are mapped onto imsAuth.js's expected field names here rather than
// changing that shared module for one caller.
async function buildHeaders (params) {
  const accessToken = await getAccessToken({
    IMS_OAUTH_S2S_CLIENT_ID: params.HARMONIZE_IMS_CLIENT_ID,
    IMS_OAUTH_S2S_CLIENT_SECRET: params.HARMONIZE_IMS_CLIENT_SECRET,
    IMS_OAUTH_S2S_SCOPES: params.HARMONIZE_IMS_SCOPES
  })
  return {
    authorization: `Bearer ${accessToken}`,
    'x-api-key': params.HARMONIZE_IMS_CLIENT_ID,
    'content-type': 'application/json'
  }
}

// The Harmonize API validates the domain behind every presigned URL it's
// given and rejects this project's own Adobe I/O Files storage ("Domain not
// allowed") — so, for this call only, everything is re-hosted on S3 via the
// presign-proxy service (actions/libs/s3.js) instead.
async function uploadToS3 (params, relativePath, buffer, contentType) {
  const { putUrl, getUrl } = await getUploadUrls(params, relativePath)
  const putResponse = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: buffer })
  if (!putResponse.ok) throw new Error(`Failed to upload ${relativePath} to S3 (${putResponse.status})`)
  return getUrl
}

async function putBufferToUrl (url, buffer, contentType) {
  const response = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: buffer })
  if (!response.ok) throw new Error(`Failed to upload harmonized output (${response.status})`)
}

async function waitForReadableUrl (url, {
  label = 'output',
  timeoutMs = 30000,
  intervalMs = 1500,
  logger = console
} = {}) {
  const startedAt = Date.now()
  let lastStatus = 'n/a'
  let lastBody = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' })
      lastStatus = response.status

      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        logger.info(`${label} readable -> ${response.status} ${contentType}`)
        return true
      }

      lastBody = await response.text().catch(() => '')
      logger.info(`${label} not ready -> ${response.status} ${lastBody.slice(0, 200)}`)
    } catch (error) {
      lastBody = error.message
      logger.info(`${label} not ready -> ${error.message}`)
    }

    await sleep(intervalMs)
  }

  throw new Error(`${label} was not readable after ${timeoutMs}ms. Last status=${lastStatus}. Last body=${lastBody.slice(0, 300)}`)
}

async function submitJob (body, headers) {
  const response = await fetch(`${BASE_URL}/v2/harmonize-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Harmonize submit returned ${response.status}: ${JSON.stringify(data)}`)
  }
  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  return { ...data, retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null }
}

// The job isn't always immediately queryable right after submit — a 404
// ('unknown_job_id') in the first while is propagation lag, not a real
// failure, so it gets a grace period before being treated as fatal. (Seen
// 200s with an empty/unparseable body before the eventual 404, so this is
// generous while that gets diagnosed.)
const NOT_FOUND_GRACE_MS = 45000

function parseStatusText (text, contentType) {
  if (!contentType?.toLowerCase().includes('multipart/')) {
    try { return JSON.parse(text) } catch {}

    // Some Harmonize status responses have arrived as multipart bodies without
    // a reliable multipart content-type in App Builder's fetch runtime. Fall
    // through to extracting the embedded JSON object from the raw body.
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try { return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) } catch {}
    }
    return null
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  if (!boundaryMatch) return null
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2].trim()}`

  for (const part of text.split(boundary)) {
    const separator = part.includes('\r\n\r\n') ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n')
    if (separator < 0) continue
    const separatorLength = part.includes('\r\n\r\n') ? 4 : 2
    const body = part.slice(separator + separatorLength).trim().replace(/--$/, '').trim()
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }

  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try { return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) } catch {}
  }
  return null
}

function trimPartBody (body) {
  let end = body.length
  while (end > 0 && (body[end - 1] === 10 || body[end - 1] === 13 || body[end - 1] === 45)) end--
  return body.slice(0, end)
}

function parseStatusResponse (buffer, contentType) {
  const text = buffer.toString('latin1')
  const data = parseStatusText(Buffer.from(text, 'latin1').toString('utf8'), contentType)
  const lowerContentType = (contentType || '').toLowerCase()
  const boundaryMatch = lowerContentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const firstLineBoundary = text.startsWith('--') ? text.slice(0, text.indexOf('\n')).trim() : null
  const boundary = boundaryMatch ? `--${boundaryMatch[1] || boundaryMatch[2].trim()}` : firstLineBoundary
  if (!boundary) return { data, imagePart: null, previewText: Buffer.from(text, 'latin1').toString('utf8') }

  let imagePart = null
  for (const rawPart of text.split(boundary)) {
    const separator = rawPart.includes('\r\n\r\n') ? rawPart.indexOf('\r\n\r\n') : rawPart.indexOf('\n\n')
    if (separator < 0) continue
    const separatorLength = rawPart.includes('\r\n\r\n') ? 4 : 2
    const headers = rawPart.slice(0, separator).toLowerCase()
    const body = trimPartBody(Buffer.from(rawPart.slice(separator + separatorLength), 'latin1'))
    const contentTypeMatch = headers.match(/content-type:\s*([^\r\n]+)/i)
    const partContentType = (contentTypeMatch?.[1] || '').trim()
    if (partContentType.startsWith('image/') && body.length > 0) {
      imagePart = { buffer: body, contentType: partContentType }
    }
  }

  return { data, imagePart, previewText: Buffer.from(text, 'latin1').toString('utf8') }
}

async function pollJob (statusUrl, headers, logger) {
  const deadline = Date.now() + MAX_WAIT_MS
  const notFoundDeadline = Date.now() + NOT_FOUND_GRACE_MS
  for (;;) {
    const response = await fetch(statusUrl, { headers })
    const buffer = Buffer.from(await response.arrayBuffer())
    const { data, imagePart, previewText } = parseStatusResponse(buffer, response.headers.get('content-type'))
    const status = String(data?.status || '').toLowerCase()
    // Every 200 so far has come back with status=n/a — logging the raw body
    // (not just the parsed status) to see what's actually in it.
    logger.info(`poll ${statusUrl} -> ${response.status} status=${status || 'n/a'} imagePart=${imagePart ? imagePart.contentType : 'none'} body=${previewText.slice(0, 300)}`)

    if (TERMINAL_SUCCESS.has(status)) return { data, imagePart }
    if (TERMINAL_FAILURE.has(status)) {
      throw new Error(`Harmonize job ${status}: ${data?.message || JSON.stringify(data)}`)
    }
    if (!response.ok) {
      if (response.status === 404 && Date.now() < notFoundDeadline) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }
      throw new Error(`Harmonize status returned ${response.status} at ${statusUrl}: ${JSON.stringify(data)}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`Harmonize job timed out (jobId: ${data?.jobId || 'unknown'})`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

// Generative harmonization (Firefly Services /v2/harmonize-image) blends the
// composited foreground into its background with AI, unlike the old /v2/edit
// endpoint's plain tone/color nudges — it requires a binary foreground/
// background mask alongside the image. That mask is derived here from the
// same layer bounds/visibility psd-composite already used to build the
// composite (see rasterMask.js), so the user never has to supply one.
async function main (params) {
  const logger = Core.Logger('psd-harmonize', { level: params.LOG_LEVEL || 'info' })
  const { presignedUrl, edits, documentWidth, documentHeight, outputFormat } = params

  const validationError = validate({ presignedUrl, edits, documentWidth, documentHeight })
  if (validationError) return badRequest(validationError)

  try {
    const headers = await buildHeaders(params)

    const compositeResponse = await fetch(presignedUrl)
    if (!compositeResponse.ok) throw new Error(`Failed to read composite image (${compositeResponse.status})`)
    const compositeBuffer = Buffer.from(await compositeResponse.arrayBuffer())
    const maskBuffer = buildForegroundMaskPng(documentWidth, documentHeight, edits)

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const format = outputFormat === 'png' ? 'png' : 'jpeg'
    const [imageUrl, maskUrl, { putUrl: outputPutUrl, getUrl: outputGetUrl }] = await Promise.all([
      uploadToS3(params, `harmonize/image-${stamp}.png`, compositeBuffer, 'image/png'),
      uploadToS3(params, `harmonize/mask-${stamp}.png`, maskBuffer, 'image/png'),
      getUploadUrls(params, `harmonize/output-${stamp}.${format === 'png' ? 'png' : 'jpg'}`)
    ])

    // A 404 'unknown_job_id' on first poll usually means the job crashed before
    // ever being recorded, not that we polled too early — most often because
    // Firefly's own servers couldn't actually fetch one of these URLs. Checked
    // here (not just trusted from our own successful PUT) so a bad presigned
    // GET URL surfaces as a clear error instead of a mystery 404 minutes later.
    for (const [label, url] of [['image', imageUrl], ['mask', maskUrl]]) {
      const check = await fetch(url, { method: 'GET' })
      logger.info(`sanity GET ${label} -> ${check.status} (${url})`)
      if (!check.ok) throw new Error(`Uploaded ${label} is not publicly readable at its presigned URL (${check.status}): ${url}`)
    }

    const { statusUrl, retryAfterSeconds, jobId } = await submitJob({
      image: { source: { url: imageUrl } },
      mask: { source: { url: maskUrl } },
      output: {
        format,
        presignedUrl: { outputs: outputPutUrl }
      }
    }, headers)
    logger.info(`submitted harmonize job ${jobId}, statusUrl=${statusUrl}, retryAfterSeconds=${retryAfterSeconds}`)

    // Submit's own Retry-After hint (default 5s) — polling immediately is
    // exactly what produced the 'unknown_job_id' 404s in practice.
    await sleep((retryAfterSeconds || 5) * 1000)

    const { data: result, imagePart } = await pollJob(statusUrl, headers, logger)
    logger.info(`harmonize job result: ${JSON.stringify(result)}`)

    if (!outputGetUrl) throw new Error('Missing S3 output GET URL for harmonized image preview')

    if (imagePart) {
      logger.info(`uploading multipart harmonized image to S3 output (${imagePart.contentType}, ${imagePart.buffer.length} bytes)`)
      await putBufferToUrl(outputPutUrl, imagePart.buffer, imagePart.contentType)
    }

    await waitForReadableUrl(outputGetUrl, {
      label: 'harmonized output',
      logger
    })

    return ok({
      ok: true,
      harmonizedUrl: outputGetUrl,
      jobId: result?.jobId || jobId,
      result
    })
  } catch (e) {
    logger.error(e.message)
    return serverError('Failed to harmonize the composite. Please try again.')
  }
}

exports.main = withCors(main)

