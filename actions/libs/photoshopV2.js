// Hand-rolled client for the Photoshop v2 API (https://photoshop-api.adobe.io,
// Firefly Services) — there's no official Adobe SDK for v2 yet. Used only for
// the save/composite step (psd-composite), which needs v2's transform.angle for
// rotation — v1's Layer edit schema has no rotation field at all (verified
// against the SDK's own type defs). The manifest/rendition read path stays on
// v1 (actions/libs/photoshopClient.js) since that's proven stable; no reason to
// touch what's working.
//
// v1's 403 ErrInvalidAPIKey (see actions/psd-manifest history) was sending
// API_KEY (a legacy key for a different integration) as v2's X-Api-Key. v2
// lives under a Firefly Services entitlement attached to the OAuth Server-to-
// Server credential itself — its own client ID is the right X-Api-Key, not
// API_KEY.
const { getAccessToken } = require('./imsAuth')

const BASE_URL = 'https://photoshop-api.adobe.io'
const POLL_INTERVAL_MS = 2000
const TERMINAL_SUCCESS = new Set(['succeeded', 'success', 'completed'])
const TERMINAL_FAILURE = new Set(['failed', 'error'])

async function buildHeaders (params) {
  const accessToken = await getAccessToken(params)
  return {
    authorization: `Bearer ${accessToken}`,
    'x-api-key': params.IMS_OAUTH_S2S_CLIENT_ID,
    'content-type': 'application/json'
  }
}

async function submitJob (path, body, params) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: await buildHeaders(params),
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Photoshop API ${path} returned ${response.status}: ${JSON.stringify(data)}`)
  }
  return data
}

async function pollJob (jobId, statusUrl, params, maxWaitMs) {
  const url = statusUrl || `${BASE_URL}/v2/status/${jobId}`
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    const response = await fetch(url, { headers: await buildHeaders(params) })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Photoshop API job status returned ${response.status}: ${JSON.stringify(data)}`)
    }

    const status = String(data?.status || '').toLowerCase()
    if (TERMINAL_SUCCESS.has(status)) return data
    if (TERMINAL_FAILURE.has(status)) {
      throw new Error(`Photoshop job failed: ${JSON.stringify(data?.errorDetails || data)}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`Photoshop job timed out (jobId: ${data?.jobId || jobId})`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

async function runJob (path, body, params, maxWaitMs) {
  const { jobId, statusUrl } = await submitJob(path, body, params)
  return pollJob(jobId, statusUrl, params, maxWaitMs)
}

module.exports = { runJob }
