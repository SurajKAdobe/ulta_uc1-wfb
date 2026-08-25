// Thin wrapper around the official Photoshop API SDK (v1 — image.adobe.io) — reuses
// the same IMS Server-to-Server credential/token minting as run-workflow.adobe.io
// (imsAuth.js). No v2 (photoshop-api.adobe.io / Firefly Services) support here: this
// account's API key (bulk-automation-web) got a 403 ErrInvalidAPIKey from v2, meaning
// it was never provisioned as a Firefly Services credential — v1 works today with
// what's already in .env.
const PhotoshopAPI = require('@adobe/aio-lib-photoshop-api')
const { getAccessToken } = require('./imsAuth')

async function getClient (params) {
  const accessToken = await getAccessToken(params)
  return PhotoshopAPI.init(params.IMS_OAUTH_S2S_ORG_ID, params.API_KEY, accessToken)
}

module.exports = { getClient }
