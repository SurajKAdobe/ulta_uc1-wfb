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
// psd-composite/index.js — "create" and "edit" are the same call).
export async function saveComposite (sourceKey, edits) {
  const presignedUrl = await refreshPresignedUrl(sourceKey)
  const { putUrl, getUrl, key } = await callAction('presign-upload', {
    kind: 'psd',
    fileName: 'composite.psd'
  })
  await callAction('psd-composite', { presignedUrl, outputPutUrl: putUrl, edits })
  return { presignedUrl: getUrl, key }
}
