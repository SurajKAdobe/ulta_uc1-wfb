const { getAccessToken } = require('./imsAuth')

const FIREFLY_API = 'https://firefly-api.adobe.io'
const ULTA_UC4_CUSTOM_MODEL_ID = 'urn:aaid:sc:VA6C2:c34b742d-b492-49e6-9726-67887735fc5a'

function requestId () {
  return require('crypto').randomUUID()
}

async function buildFireflyHeaders (params, extra = {}) {
  if (!params.API_KEY) throw new Error('Firefly API_KEY is not configured')

  return {
    accept: 'application/json',
    authorization: `Bearer ${await getAccessToken(params)}`,
    'x-api-key': params.API_KEY,
    'x-request-id': requestId(),
    ...extra
  }
}

async function parseResponse (response, operation) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.message || data?.error?.message || data?.error || 'Adobe Firefly returned an error'
    throw new Error(`${operation} failed (${response.status}): ${String(detail).slice(0, 500)}`)
  }
  return data
}

module.exports = { FIREFLY_API, ULTA_UC4_CUSTOM_MODEL_ID, buildFireflyHeaders, parseResponse }
