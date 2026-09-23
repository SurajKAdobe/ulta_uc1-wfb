const { PNG } = require('pngjs')

// Rough foreground/background mask for the Harmonize Image API's required
// `mask` input: solid white rotated rectangles (one per visible non-background
// edit — psd-composite's own edits shape, bounds are center-pivot like its
// transform.angle) on a black canvas, rather than a true per-pixel silhouette.
// Good enough to point the generative harmonizer at the composited subject
// without a second Photoshop render + alpha-channel extraction pass.
function buildForegroundMaskPng (width, height, edits) {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0
    png.data[i + 1] = 0
    png.data[i + 2] = 0
    png.data[i + 3] = 255
  }

  for (const edit of edits) {
    if (edit.visible === false || !edit.bounds) continue
    const { left, top, width: w, height: h, rotate } = edit.bounds
    if (!w || !h) continue

    const cx = left + w / 2
    const cy = top + h / 2
    const halfW = w / 2
    const halfH = h / 2
    const theta = ((rotate || 0) * Math.PI) / 180
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)

    // Rotated corners' bounding box, clamped to canvas — scans just this
    // layer's footprint instead of every pixel on every layer.
    const corners = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]]
      .map(([x, y]) => [cx + x * cosT - y * sinT, cy + x * sinT + y * cosT])
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))))
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))))
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))))
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))))

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px + 0.5 - cx
        const dy = py + 0.5 - cy
        // Inverse-rotate the canvas point back into the rect's local frame.
        const localX = dx * cosT + dy * sinT
        const localY = -dx * sinT + dy * cosT
        if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
          const idx = (width * py + px) << 2
          png.data[idx] = 255
          png.data[idx + 1] = 255
          png.data[idx + 2] = 255
          png.data[idx + 3] = 255
        }
      }
    }
  }

  return PNG.sync.write(png)
}

module.exports = { buildForegroundMaskPng }
