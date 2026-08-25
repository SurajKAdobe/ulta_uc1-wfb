// Mints IMS access tokens on demand via an OAuth Server-to-Server (client_credentials)
// technical account, so nobody has to hand-paste a ~24h user-session token into .env
// and re-deploy every time it expires. Cached in module scope for the lifetime of a
// warm Adobe I/O Runtime container — a real cache would survive cold starts too, but
// one extra IMS round-trip per cold invocation isn't worth the added infra for this.
const DEFAULT_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'

// Refresh this many seconds before actual expiry, so a token never gets used
// right up against the edge of going stale mid-request.
const EXPIRY_SAFETY_MARGIN_SECONDS = 60

let cached = null // { token, expiresAt } | null

// IMS_OAUTH_S2S_SCOPES is stored as a JSON array string (Developer Console's own
// export format, e.g. '["openid","AdobeID",...]') — the token request wants them
// comma-joined instead. Falls back to treating it as an already-plain string.
function normalizeScopes (raw) {
  if (!raw) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.join(',') : raw
  } catch {
    return raw
  }
}

async function fetchAccessToken (params) {
  const tokenUrl = params.IMS_TOKEN_URL || DEFAULT_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: params.IMS_OAUTH_S2S_CLIENT_ID,
    client_secret: params.IMS_OAUTH_S2S_CLIENT_SECRET,
    scope: normalizeScopes(params.IMS_OAUTH_S2S_SCOPES)
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  const data = await response.json().catch(() => null)

  if (!response.ok || !data?.access_token) {
    throw new Error(`IMS token request failed (${response.status}): ${data?.error_description || data?.error || 'no error detail'}`)
  }

  return { token: data.access_token, expiresInSeconds: data.expires_in }
}

async function getAccessToken (params) {
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.token
  }

  const { token, expiresInSeconds } = await fetchAccessToken(params)
  cached = {
    token,
    expiresAt: now + Math.max(0, (expiresInSeconds - EXPIRY_SAFETY_MARGIN_SECONDS)) * 1000
  }
  return token
}

module.exports = { getAccessToken }
