// Normalizes bounds to {left, top, width, height} regardless of which Photoshop
// API version answered — v1 used that shape directly, v2's manifest reportedly
// uses {left, top, right, bottom} instead (per Adobe's v1-to-v2 migration notes).
// `rotate` is folded in here too (from the manifest's own per-layer `rotate`
// field) so rotation lives alongside position/size as one piece of geometry that
// drag/resize/rotate edits all update the same way.
function normalizeBounds (bounds, rotate) {
  if (!bounds) return null
  const { left = 0, top = 0 } = bounds
  const width = bounds.width ?? (bounds.right != null ? bounds.right - left : undefined)
  const height = bounds.height ?? (bounds.bottom != null ? bounds.bottom - top : undefined)
  if (width == null || height == null) return null
  return { left, top, width, height, rotate: rotate || 0 }
}

// v1 thumbnails were a plain presigned URL string; v2's are reportedly a
// {mediaType, url} object.
function normalizeThumbnail (thumbnail) {
  if (!thumbnail) return null
  return typeof thumbnail === 'string' ? thumbnail : thumbnail.url || null
}

// Flattens the manifest's nested layer tree (group layers have `children`) into
// a single list, keeping only layers with usable bounds — those are the ones
// LayerCanvas can position/resize (per the Layer typedef in
// @adobe/aio-lib-photoshop-api, bounds apply to layer/text/adjustment/section/
// smartObject/fill types, not e.g. a flat background layer).
export function flattenLayers (layers, out = [], depth = 0) {
  for (const layer of layers || []) {
    const bounds = normalizeBounds(layer.bounds, layer.rotate)
    if (bounds) {
      out.push({
        ...layer,
        bounds,
        // Kept separate from `bounds` (which drag/resize overwrites) — the psd-
        // manifest rendition is a full-canvas image with this layer's pixels
        // baked in at their *original* position, so LayerCanvas needs to know
        // where to crop from regardless of where the box has since been moved to.
        sourceBounds: bounds,
        thumbnail: normalizeThumbnail(layer.thumbnail),
        // Nesting depth, for LayerList's indentation — cosmetic only.
        depth
      })
    }
    if (layer.children) flattenLayers(layer.children, out, depth + 1)
  }
  return out
}
