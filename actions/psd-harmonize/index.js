const { Core } = require('@adobe/aio-sdk')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { runJob } = require('../libs/photoshopV2')
const { getUploadUrls } = require('../libs/storage')

const ACTION_FILE = 'Harmonization_Process V2.atn'
const ACTION_NAME = 'Harmonize Products'
const MAX_WAIT_MS = 250000

function validate (params) {
  if (!params.psdPresignedUrl) return 'psdPresignedUrl is required'
  if (!params.IMS_OAUTH_S2S_CLIENT_ID || !params.IMS_OAUTH_S2S_CLIENT_SECRET || !params.IMS_OAUTH_S2S_SCOPES) {
    return 'Photoshop OAuth Server-to-Server credentials are not fully configured'
  }
  return null
}

async function main (params) {
  const logger = Core.Logger('psd-harmonize', { level: params.LOG_LEVEL || 'info' })
  const validationError = validate(params)
  if (validationError) return badRequest(validationError)

  let preparingStorage = true
  try {
    const deadline = Date.now() + MAX_WAIT_MS
    const remainingTime = () => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('Photoshop harmonization timed out')
      return remaining
    }
    const bundledPath = path.join(__dirname, 'photoshop-action', ACTION_FILE)
    const sourcePath = path.resolve(__dirname, '../../photoshop-action', ACTION_FILE)
    const actionBytes = fs.readFileSync(fs.existsSync(bundledPath) ? bundledPath : sourcePath)
    const actionHash = createHash('sha256').update(actionBytes).digest('hex')
    const actionKey = `defaults/photoshop-actions/${actionHash}.atn`
    const actionSlot = await getUploadUrls(actionKey)
    const uploadResponse = await fetch(actionSlot.putUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: actionBytes
    })
    if (!uploadResponse.ok) throw new Error(`Photoshop action upload failed: HTTP ${uploadResponse.status}`)
    const actionUrl = actionSlot.getUrl

    const outputPrefix = `uc4/harmonized/${randomUUID()}`
    const intermediateKey = `${outputPrefix}/action.psd`
    const harmonizedPsdKey = `${outputPrefix}/harmonized.psd`
    const harmonizedPngKey = `${outputPrefix}/harmonized.png`
    const [intermediate, psd, png] = await Promise.all([
      getUploadUrls(intermediateKey),
      getUploadUrls(harmonizedPsdKey),
      getUploadUrls(harmonizedPngKey)
    ])

    preparingStorage = false
    logger.info('Submitting Photoshop Harmonize Products action')
    const actionResult = await runJob('/v2/execute-actions', {
      image: { source: { url: params.psdPresignedUrl } },
      options: { actions: [{ actionName: ACTION_NAME, source: { url: actionUrl } }] },
      outputs: [{ destination: { url: intermediate.putUrl }, mediaType: 'image/vnd.adobe.photoshop' }]
    }, params, remainingTime())

    logger.info('Rendering harmonized PSD and PNG')
    const result = await runJob('/v2/create-composite', {
      image: { source: { url: intermediate.getUrl } },
      outputs: [
        { destination: { url: psd.putUrl }, mediaType: 'image/vnd.adobe.photoshop' },
        { destination: { url: png.putUrl }, mediaType: 'image/png', cropMode: 'document_bounds' }
      ]
    }, params, remainingTime())

    logger.info(`Photoshop harmonization completed: ${result.jobId}`)
    return ok({
      ok: true,
      harmonizedUrl: png.getUrl,
      harmonizedPsdUrl: psd.getUrl,
      harmonizedPsdKey,
      harmonizedPngKey,
      jobId: result.jobId,
      actionJobId: actionResult.jobId,
      result
    })
  } catch (error) {
    logger.error(error.message)
    return serverError(preparingStorage
      ? 'Failed to prepare Photoshop action storage. Check Adobe I/O Files access and Runtime storage credentials.'
      : 'Failed to harmonize the PSD with Photoshop. Check the action and template compatibility, then try again.')
  }
}

exports.main = withCors(main)
