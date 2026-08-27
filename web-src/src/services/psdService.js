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
  const { putUrl, getUrl, key } = await callAction('presign-upload', {
    kind: 'psd',
    fileName: 'composite.psd'
  })
  await callAction('psd-composite', { presignedUrl, outputPutUrl: putUrl, edits })
  return { presignedUrl: getUrl, key }
}
