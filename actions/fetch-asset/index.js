const { nanoid } = require('nanoid')
const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { getUploadUrls } = require('../libs/s3')

// Relays a Workflow Builder output asset (PSD/PNG) into our own S3 bucket and
// hands back a fresh presigned GET for it — needed because the storage hosts
// WFB presigns to (ffestorageprod.blob.core.windows.net, firefly.azureedge.net)
// don't send CORS headers, so a browser/Figma-plugin fetch() straight to them
// is blocked. A server-to-server fetch here isn't subject to CORS at all.
//
// Not a base64-in-JSON proxy (an earlier version was) — Adobe I/O Runtime web
// actions cap the total HTTP response at ~1MB, and a real rendition came back
// at 61MB live. Re-uploading to S3 and returning a URL keeps the action's own
// response tiny regardless of asset size; the actual bytes flow browser<->S3
// directly, same as presign-upload's uploads already do.
//
// Restricted to the same known WFB/S3 storage hosts execute-uc4-workflow's
// comment documents (amazonaws.com, adobe.io) plus the Azure hosts confirmed
// live — this is a URL-fetching proxy, so an open allowlist would make it an
// SSRF vector.
const ALLOWED_HOST_SUFFIXES = [
  '.amazonaws.com',
  '.adobe.io',
  '.azureedge.net',
  '.blob.core.windows.net'
]

function isAllowedHost (url) {
  try {
    const { hostname, protocol } = new URL(url)
    return protocol === 'https:' && ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

function extensionFor (mimeType) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  return 'bin'
}

async function main (params) {
  const logger = Core.Logger('fetch-asset', { level: params.LOG_LEVEL || 'info' })
  const { url } = params

  if (!url) return badRequest('url is required')
  if (!isAllowedHost(url)) return badRequest('url host is not an allowed asset storage host')

  try {
    const response = await fetch(url)
    if (!response.ok) return serverError(`Asset fetch failed (${response.status})`)

    const mimeType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await response.arrayBuffer())

    const relativePath = `uploads/relay/${Date.now()}-${nanoid(8)}.${extensionFor(mimeType)}`
    const { putUrl, getUrl } = await getUploadUrls(params, relativePath)

    const putResponse = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'content-type': mimeType },
      body: buffer
    })
    if (!putResponse.ok) return serverError(`Relay upload failed (${putResponse.status})`)

    return ok({ ok: true, url: getUrl, mimeType })
  } catch (e) {
    logger.error(e.message)
    return serverError(`Asset fetch failed: ${e.message}`)
  }
}

exports.main = main
