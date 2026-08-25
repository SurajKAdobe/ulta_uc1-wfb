import { callAction } from '../api'

const DEFAULT_TEMPLATE_KEY = 'defaults/primary-template/bg_change.psd'
const DEFAULT_TEMPLATE_FILE_NAME = 'bg_change.psd'

// Gets a put/get URL pair from the backend (S3 presign proxy), PUTs the file bytes
// directly to S3, then hands back the get URL for Workflow Builder to read from.
// The action never sees file bytes, and the browser never sees AWS credentials.
// `key` is kept so a fresh (unexpired) read URL can be re-minted right before execute.
export async function uploadFile (file, kind) {
  const { putUrl, getUrl, storageType, key } = await callAction('presign-upload', {
    kind,
    fileName: file.name
  })

  const putResponse = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file
  })

  if (!putResponse.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  return { presignedUrl: getUrl, storageType, fileName: file.name, size: file.size, key }
}

// Same pattern as getDefaultAdditionalTemplates — this file was uploaded once,
// out-of-band, to a fixed S3 key; this only ever re-presigns a fresh GET for it,
// never re-uploads. If this 403s, the object at DEFAULT_TEMPLATE_KEY itself needs
// to be (re-)seeded in S3 out-of-band — that's an infra fix, not something this
// call can paper over.
export async function getDefaultTemplate () {
  const presignedUrl = await refreshPresignedUrl(DEFAULT_TEMPLATE_KEY)
  return { presignedUrl, storageType: 'AWS', fileName: DEFAULT_TEMPLATE_FILE_NAME, key: DEFAULT_TEMPLATE_KEY }
}

// The presign proxy's URLs expire (observed: 4h). If a file was uploaded and then
// left sitting in the UI for a while before Execute is clicked, its original
// presignedUrl may no longer be valid — mint a fresh one for the same S3 object.
export async function refreshPresignedUrl (key) {
  const { presignedUrl } = await callAction('refresh-presign', { key })
  return presignedUrl
}

// The 6 additional templates were uploaded once (one-off script) to fixed S3 keys —
// this only re-presigns fresh read URLs for them, never re-uploads.
export async function getDefaultAdditionalTemplates () {
  const { templates } = await callAction('default-additional-templates')
  return templates
}
