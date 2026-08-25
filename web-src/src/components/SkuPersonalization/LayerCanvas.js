import React from 'react'
import { Rnd } from 'react-rnd'
import { Text } from '@adobe/react-spectrum'

const MAX_CANVAS_WIDTH = 640
const MAX_CANVAS_HEIGHT = 560

// Renders the PSD's layers as draggable/resizable boxes positioned by the manifest's
// bounds (in original PSD pixels), scaled down to fit the preview area. This is a
// DOM-based stand-in for a real compositor — layers show as their thumbnail (if the
// manifest returned one) or a labeled placeholder box, not truly rendered/blended
// pixels. Good enough to move/resize layers for a composite; not a pixel-accurate
// Photoshop preview.
export default function LayerCanvas ({ psdDocument, layers, selectedId, onSelect, onChange, disabled }) {
  if (!psdDocument) return null

  const scale = Math.min(MAX_CANVAS_WIDTH / psdDocument.width, MAX_CANVAS_HEIGHT / psdDocument.height, 1)
  const canvasWidth = psdDocument.width * scale
  const canvasHeight = psdDocument.height * scale

  // The manifest lists layers topmost-first (Photoshop's own Layers-panel order),
  // but later DOM siblings paint over earlier ones — rendering in manifest order put
  // full-canvas background layers on top of everything, hiding the real content
  // underneath. Reverse so the bottom of the stack paints first. Group/section
  // layers are skipped here too — their thumbnail is a render of their own
  // children, so they'd otherwise cover those same children with a duplicate.
  // Layers hidden in the source PSD (layer.visible === false) are skipped rather
  // than dimmed — templates like this one keep several alternate-SKU candidates
  // stacked in the same overlapping slot, all hidden by default; showing them all
  // at once just looks like broken/overlapping boxes. Toggle one on in the layer
  // list (LayerList's checkbox) to bring it into the preview.
  const renderableLayers = layers
    .filter((l) => l.type !== 'layerSection' && l.visible !== false)
    .reverse()

  return (
    <div
      style={{
        position: 'relative',
        width: canvasWidth,
        height: canvasHeight,
        margin: '0 auto',
        overflow: 'hidden',
        border: '1px solid var(--spectrum-global-color-gray-300)',
        // Checkerboard background stands in for PSD transparency.
        backgroundImage:
          'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
      }}
    >
      {renderableLayers.map((layer) => {
        const boxWidth = layer.bounds.width * scale
        const boxHeight = layer.bounds.height * scale
        // createRendition (actions/psd-manifest/index.js) returns the layer's
        // rendition at full document-canvas size with everything else transparent
        // — crop it like a sprite sheet instead of fitting the whole (mostly-empty)
        // image into the box. The crop offset is anchored to sourceBounds (the
        // layer's original position), not the live bounds, so a dragged/resized box
        // still shows the same source pixels rather than sampling a new spot each
        // time it moves.
        const source = layer.sourceBounds || layer.bounds
        // Zoom X/Y independently, so a non-uniform resize (dragging just one
        // edge/corner) stretches the crop to match instead of only scaling
        // correctly in the direction the width changed.
        const zoomX = layer.thumbnailIsFullCanvas ? boxWidth / (source.width * scale) : 1
        const zoomY = layer.thumbnailIsFullCanvas ? boxHeight / (source.height * scale) : 1

        return (
          <Rnd
            key={layer.id}
            bounds="parent"
            disableDragging={disabled}
            enableResizing={!disabled}
            size={{ width: boxWidth, height: boxHeight }}
            position={{ x: layer.bounds.left * scale, y: layer.bounds.top * scale }}
            onDragStop={(e, d) => onChange(layer.id, { ...layer.bounds, left: Math.round(d.x / scale), top: Math.round(d.y / scale) })}
            onResizeStop={(e, dir, ref, delta, pos) => onChange(layer.id, {
              width: Math.round(ref.offsetWidth / scale),
              height: Math.round(ref.offsetHeight / scale),
              left: Math.round(pos.x / scale),
              top: Math.round(pos.y / scale)
            })}
            onMouseDown={() => onSelect(layer.id)}
            style={{
              // Transparent (not "none") when unselected — keeps box-sizing
              // identical so nothing shifts by 2px when selection changes.
              border: `2px solid ${selectedId === layer.id ? 'var(--ulta-accent)' : 'transparent'}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: layer.thumbnail ? 'transparent' : 'rgba(244,124,57,0.08)'
            }}
          >
            {!layer.thumbnail && (
              <Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-gray-700)', pointerEvents: 'none' }}>{layer.name}</Text>
            )}
            {layer.thumbnail && layer.thumbnailIsFullCanvas && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  backgroundImage: `url(${layer.thumbnail})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${canvasWidth * zoomX}px ${canvasHeight * zoomY}px`,
                  backgroundPosition: `${-(source.left * scale) * zoomX}px ${-(source.top * scale) * zoomY}px`
                }}
              />
            )}
            {layer.thumbnail && !layer.thumbnailIsFullCanvas && (
              <img src={layer.thumbnail} alt={layer.name} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            )}
          </Rnd>
        )
      })}
    </div>
  )
}
