import React, { useState } from 'react'
import { Rnd } from 'react-rnd'
import { Text } from '@adobe/react-spectrum'

const MAX_CANVAS_WIDTH = 640
const MAX_CANVAS_HEIGHT = 560

// Small circular handle above the selected box — drag it around the box's
// center to set a rotation angle. ponytail: the handle itself stays fixed at
// "north" of the box's un-rotated frame rather than orbiting with the current
// angle between edits — simpler, and you're already looking at the box while
// dragging so it doesn't need to visually track rotation to stay usable.
function RotateHandle ({ onRotateChange, onRotateEnd }) {
  function handlePointerDown (e) {
    e.stopPropagation()
    e.preventDefault()
    // parentElement, not offsetParent — offsetParent depends on react-rnd's
    // internal DOM structure (which wrapper div is actually "positioned" isn't
    // guaranteed), so it could resolve to something other than this box and put
    // the handle nowhere near it. parentElement is the content wrapper div we
    // render below, which we control and know is sized to exactly match the box.
    const box = e.currentTarget.parentElement.getBoundingClientRect()
    const centerX = box.left + box.width / 2
    const centerY = box.top + box.height / 2
    let lastDeg = 0

    function onMove (moveEvent) {
      const dx = moveEvent.clientX - centerX
      const dy = moveEvent.clientY - centerY
      // atan2 measures from "east"; +90 so pointing straight up is 0deg.
      lastDeg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360)
      onRotateChange(lastDeg)
    }
    function onUp () {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      onRotateEnd(lastDeg)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handlePointerDown}
      role="slider"
      aria-label="Rotate layer"
      aria-valuenow={0}
      style={{
        position: 'absolute',
        top: -22,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'var(--ulta-accent)',
        border: '2px solid #fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        cursor: 'grab'
      }}
    />
  )
}

// Renders the PSD's layers as draggable/resizable/rotatable boxes positioned by
// the manifest's bounds (in original PSD pixels), scaled down to fit the preview
// area. This is a DOM-based stand-in for a real compositor — layers show as
// their thumbnail/rendition, not truly rendered/blended pixels. Good enough to
// move/resize/rotate layers for a composite; not a pixel-accurate Photoshop
// preview.
export default function LayerCanvas ({ psdDocument, layers, selectedId, onSelect, onChange, disabled }) {
  // Live-tracks rotation while the handle is being dragged (before it's
  // committed via onChange) — same reasoning as the old liveResize tracking:
  // React state only needs to update once the gesture ends.
  const [liveRotate, setLiveRotate] = useState(null) // { layerId, angle }

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
        const isSelected = selectedId === layer.id
        const angle = liveRotate?.layerId === layer.id ? liveRotate.angle : (layer.bounds.rotate || 0)

        // createRendition (actions/psd-manifest/index.js) sometimes returns the
        // layer's rendition at full document-canvas size (everything else
        // transparent) and sometimes a tight per-layer crop — verified per-layer
        // server-side (thumbnailIsFullCanvas), not assumed. Full-canvas needs
        // cropping out like a sprite sheet; a tight crop is just a normal image.
        const source = layer.sourceBounds || layer.bounds
        const zoomX = layer.thumbnailIsFullCanvas ? boxWidth / (source.width * scale) : 1
        const zoomY = layer.thumbnailIsFullCanvas ? boxHeight / (source.height * scale) : 1

        return (
          <Rnd
            key={layer.id}
            bounds="parent"
            disableDragging={disabled}
            enableResizing={!disabled}
            lockAspectRatio
            size={{ width: boxWidth, height: boxHeight }}
            position={{ x: layer.bounds.left * scale, y: layer.bounds.top * scale }}
            onDragStop={(e, d) => onChange(layer.id, { ...layer.bounds, left: Math.round(d.x / scale), top: Math.round(d.y / scale) })}
            onResizeStop={(e, dir, ref, delta, pos) => onChange(layer.id, {
              ...layer.bounds,
              width: Math.round(ref.offsetWidth / scale),
              height: Math.round(ref.offsetHeight / scale),
              left: Math.round(pos.x / scale),
              top: Math.round(pos.y / scale)
            })}
            onMouseDown={() => onSelect(layer.id)}
            style={{
              // Transparent (not "none") when unselected — keeps box-sizing
              // identical so nothing shifts by 2px when selection changes.
              border: `2px solid ${isSelected ? 'var(--ulta-accent)' : 'transparent'}`,
              boxSizing: 'border-box',
              backgroundColor: layer.thumbnail ? 'transparent' : 'rgba(244,124,57,0.08)'
            }}
          >
            {/* Single controlled wrapper — sized to exactly match the box, so
                RotateHandle's parentElement (used to find the box's center) is
                never at the mercy of react-rnd's own internal DOM structure.
                Nothing in here clips overflow: a rotated image's corners swing
                outside its own un-rotated bounding box — real Photoshop rotation
                isn't clipped to that rectangle either, so clipping here just cut
                the rotated image off at the edges. The canvas container above
                still clips at the page's own edges. */}
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!layer.thumbnail && (
                  <Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-gray-700)', pointerEvents: 'none', transform: `rotate(${angle}deg)` }}>{layer.name}</Text>
                )}
                {layer.thumbnail && layer.thumbnailIsFullCanvas && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      transform: `rotate(${angle}deg)`,
                      backgroundImage: `url(${layer.thumbnail})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: `${canvasWidth * zoomX}px ${canvasHeight * zoomY}px`,
                      backgroundPosition: `${-(source.left * scale) * zoomX}px ${-(source.top * scale) * zoomY}px`
                    }}
                  />
                )}
                {layer.thumbnail && !layer.thumbnailIsFullCanvas && (
                  <img
                    src={layer.thumbnail}
                    alt={layer.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', transform: `rotate(${angle}deg)` }}
                  />
                )}
              </div>
              {isSelected && !disabled && (
                <RotateHandle
                  onRotateChange={(deg) => setLiveRotate({ layerId: layer.id, angle: deg })}
                  onRotateEnd={(deg) => {
                    setLiveRotate(null)
                    onChange(layer.id, { ...layer.bounds, rotate: deg })
                  }}
                />
              )}
            </div>
          </Rnd>
        )
      })}
    </div>
  )
}
