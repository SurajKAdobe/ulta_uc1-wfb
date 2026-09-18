// Figma-only editing path: turns a PSD's layers into real Figma nodes (see
// figma-plugin/src/plugin/controller.js) so they can be dragged/resized/
// rotated with Figma's own tools, then reads those nodes' current geometry
// back to build the same {id, bounds, visible} edit shape psd-composite
// already expects (see SkuPersonalization.js's handleSave for the non-Figma
// equivalent, which reads the same shape from the DOM-based LayerCanvas
// editor instead).
import { callSandbox } from './figmaBridge'

// Groups ("layerSection") and the background layer are excluded from the
// edits sent to psd-composite the same way handleSave already excludes them —
// see that function's comments for exactly why neither can carry an explicit
// transform. There's nothing meaningful to *save* for either: a group's
// bounds are just its children's bounding box, and Photoshop v2 flatly can't
// locate the background layer by name for an edit at all.
export function exportableLayers (layers) {
  return layers.filter((l) => l.type !== 'layerSection' && l.type !== 'background')
}

// Groups are still excluded from the canvas itself (a group's thumbnail is
// just a render of its own children — placing it as its own node would draw
// a duplicate on top of them), but the background layer *is* placed, locked,
// purely for visual reference — LayerCanvas.js shows it too (just excluded
// from the save, not from the picture), and without it the canvas would show
// a blank/transparent gap where the background belongs.
function canvasLayers (layers) {
  return layers.filter((l) => l.type !== 'layerSection')
}

export async function exportPsdToCanvas ({ fileName, document, layers }) {
  const { frameId } = await callSandbox('EXPORT_PSD_TO_CANVAS', {
    fileName,
    document: { width: document.width, height: document.height },
    layers: canvasLayers(layers).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      index: l.index,
      visible: l.visible !== false,
      locked: l.type === 'background',
      bounds: l.bounds,
      thumbnail: l.thumbnail,
      thumbnailIsFullCanvas: l.thumbnailIsFullCanvas
    }))
  }, 300000) // large PSDs can mean many layer images to fetch+place; generous ceiling
  return frameId
}

// Returns [{id, bounds, visible}] read straight from the exported nodes'
// current geometry — the caller (SkuPersonalization.js) merges this with the
// name/type it already has on hand before calling saveComposite, since the
// sandbox only knows about position/size/rotation/visibility, not the PSD's
// own layer metadata.
export async function syncPsdFromCanvas (frameId) {
  const { edits } = await callSandbox('SYNC_PSD_FROM_CANVAS', { frameId })
  return edits
}
