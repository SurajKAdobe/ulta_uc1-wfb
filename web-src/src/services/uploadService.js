import { callAction } from '../api'
import { callSandbox } from './figmaBridge'

const DEFAULT_TEMPLATE_KEY = 'defaults/primary-template/bg_change.psd'
const DEFAULT_TEMPLATE_FILE_NAME = 'bg_change.psd'

// Figma's plugin UI panel loads from a data: URL, which browsers report as the
// opaque origin "null" — Adobe I/O Files' storage CORS policy rejects that for
// a direct browser PUT (confirmed via the plugin's console: a CORS error, not a
// networkAccess/manifest issue, so no manifest.json change can fix it). Figma's
// plugin *sandbox* thread (figma-plugin/src/plugin/controller.js) isn't loaded
// from a data: URL and doesn't hit this — relay the PUT through it there via
// figmaBridge's postMessage relay instead. window.__FIGMA_PLUGIN__ is set only
// by figma-plugin/src/ui/index.js, so the plain web app (a normal origin, no
// CORS issue) keeps doing the PUT directly.
async function putViaFigmaSandbox (url, file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  await callSandbox('STORAGE_PUT', { url, contentType: file.type || 'application/octet-stream', bytes })
}

async function putDirect (url, file) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file
  })
  if (!response.ok) throw new Error('Upload failed. Please try again.')
}

// Gets a put/get URL pair from the backend (Adobe I/O Files presign), PUTs the file
// bytes directly to storage, then hands back the get URL for Workflow Builder to
// read from. The action never sees file bytes, and the browser never sees storage
// credentials. `key` is kept so a fresh (unexpired) read URL can be re-minted right
// before execute.
export async function uploadFile (file, kind) {
  const { putUrl, getUrl, storageType, key } = await callAction('presign-upload', {
    kind,
    fileName: file.name
  })

  if (typeof window !== 'undefined' && window.__FIGMA_PLUGIN__) {
    await putViaFigmaSandbox(putUrl, file)
  } else {
    await putDirect(putUrl, file)
  }

  return { presignedUrl: getUrl, storageType, fileName: file.name, size: file.size, key }
}

// Same pattern as getDefaultAdditionalTemplates — this file was uploaded once,
// out-of-band (see scripts/seed-default-assets.js), to a fixed storage key; this
// only ever re-presigns a fresh GET for it, never re-uploads. If this 404s, the
// object at DEFAULT_TEMPLATE_KEY itself needs to be (re-)seeded — that's an infra
// fix, not something this call can paper over.
export async function getDefaultTemplate () {
  const presignedUrl = await refreshPresignedUrl(DEFAULT_TEMPLATE_KEY)
  return { presignedUrl, storageType: 'ADOBE_IO_FILES', fileName: DEFAULT_TEMPLATE_FILE_NAME, key: DEFAULT_TEMPLATE_KEY }
}

// Presigned URLs expire (see EXPIRY_SECONDS in actions/libs/storage.js). If a file
// was uploaded and then left sitting in the UI for a while before Execute is
// clicked, its original presignedUrl may no longer be valid — mint a fresh one for
// the same stored object.
export async function refreshPresignedUrl (key) {
  const { presignedUrl } = await callAction('refresh-presign', { key })
  return presignedUrl
}

// The 6 additional templates were uploaded once (scripts/seed-default-assets.js) to
// fixed storage keys — this only re-presigns fresh read URLs for them, never
// re-uploads.
export async function getDefaultAdditionalTemplates () {
  const { templates } = await callAction('default-additional-templates')
  return templates
}
