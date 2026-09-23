import { callAction } from '../api'
import { uploadFile, refreshPresignedUrl } from './uploadService'
import { flattenLayers } from '../utils/psdLayers.mjs'

export async function uploadPsd (file) {
  return uploadFile(file, 'psd')
}

// ponytail: group layers and their children both get their own draggable box, so
// dragging a group won't move its children in this preview — real nested-transform
// compositing is a much bigger feature than "initial part" calls for.

export async function getPsdManifest (presignedUrl) {
  const { document, layers } = await callAction('psd-manifest', { presignedUrl })
  return { document, layers: flattenLayers(layers) }
}

// Re-uploads the current layer bounds as a brand new composite PSD (see
// psd-composite/index.js — "create" and "edit" are the same call). `source` is
// either { key } for a PSD we uploaded ourselves (refreshed since presigned
// URLs expire and this may run a while after upload), or { presignedUrl } for
// one that's already hosted elsewhere (e.g. a UC4 workflow's own output PSD —
// no S3 key of ours to refresh).
export async function saveComposite (source, edits) {
  const presignedUrl = source.key ? await refreshPresignedUrl(source.key) : source.presignedUrl
  const [psdSlot, pngSlot] = await Promise.all([
    callAction('presign-upload', { kind: 'psd', fileName: 'composite.psd' }),
    callAction('presign-upload', { kind: 'png', fileName: 'composite.png' })
  ])
  await callAction('psd-composite', {
    presignedUrl,
    outputPutUrl: psdSlot.putUrl,
    outputPngPutUrl: pngSlot.putUrl,
    edits
  })
  return { presignedUrl: psdSlot.getUrl, key: psdSlot.key, pngPresignedUrl: pngSlot.getUrl }
}

// Runs the saved composite's flattened PNG through Photoshop's generative
// /v2/harmonize-image (see psd-harmonize/index.js) to blend the pasted-
// together layers into one cohesive-looking image. Only makes sense once a
// composite exists — needs `compositePngUrl` from a prior saveComposite call,
// not the original per-layer source PSD. `edits` (same shape saveComposite
// takes) and `documentSize` ({ width, height }) are what the action uses to
// derive the required foreground mask itself — no separate mask upload here.
// The action re-hosts everything on S3 itself (the Harmonize API rejects our
// own Adobe I/O Files domain) and hands back the final `harmonizedUrl`
// directly — no presign-upload round trip needed from here.
export async function harmonizeComposite (compositePngUrl, edits, documentSize) {
  const response = await callAction('psd-harmonize', {
    presignedUrl: compositePngUrl,
    edits,
    documentWidth: documentSize?.width,
    documentHeight: documentSize?.height
  })

  if (!response?.ok || !response?.harmonizedUrl) {
    throw new Error(response?.error?.message || 'Failed to harmonize composite')
  }

  return { harmonizedUrl: response.harmonizedUrl }
}
