// Shared auth headers for calls to run-workflow.adobe.io — kept in one place so
// execute-workflow and check-status can't drift out of sync.
const { getAccessToken } = require('./imsAuth')

async function buildWorkflowHeaders (params, extra = {}) {
  const accessToken = await getAccessToken(params)
  return {
    accept: 'application/json',
    authorization: `Bearer ${accessToken}`,
    'api-version': '1.0',
    'x-gw-ims-org-id': params.IMS_OAUTH_S2S_ORG_ID,
    'x-gw-ims-user-id': params.IMS_USER_ID,
    'x-api-key': params.API_KEY,
    ...extra
  }
}

module.exports = { buildWorkflowHeaders }
