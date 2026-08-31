import React, { useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { Text } from '@adobe/react-spectrum'

const MAX_CANVAS_WIDTH = 640
const MAX_CANVAS_HEIGHT = 560
const SNAP_THRESHOLD_PX = 6 // canvas-preview pixels, not original PSD pixels

// Selection/hover highlight that hugs the PNG's actual alpha silhouette
// instead of its rectangular bounding box — stacking several blurred, zero-
// offset drop-shadows around the image recolors every non-transparent
// pixel's edge, since drop-shadow's shadow shape follows the source's alpha
// channel, not its box. No canvas/pixel processing needed: it's a plain CSS
// filter, so it stays correct automatically as the layer moves/resizes/
// rotates. Layered radii (small/tight to large/soft) with falling opacity is
// what gives it a "glow" falloff instead of a single hard-edged ring.
const SELECTED_GLOW_FILTER = [
  'drop-shadow(0 0 2px rgba(255, 255, 255, 0.95))',
  'drop-shadow(0 0 6px rgba(255, 255, 255, 0.85))',
  'drop-shadow(0 0 12px rgba(255, 255, 255, 0.6))'
].join(' ')

// Same idea, dimmer/tighter — a hovered-but-not-selected layer shouldn't
// compete visually with the actual selection.
const HOVER_GLOW_FILTER = [
  'drop-shadow(0 0 2px rgba(255, 255, 255, 0.55))',
  'drop-shadow(0 0 6px rgba(255, 255, 255, 0.35))'
].join(' ')

// Small circular handle above the selected box — drag it around the box's
// center to set a rotation angle. ponytail: the handle itself stays fixed at
// "north" of the box's un-rotated frame rather than orbiting with the current
// angle between edits — simpler, and you're already looking at the box while
// dragging so it doesn't need to visually track rotation to stay usable.
// The number field next to it covers what the 12px dot can't: typing an exact
// angle instead of eyeballing a drag gesture.
function RotateHandle ({ angle, onRotateChange, onRotateEnd, onAngleCommit }) {
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
    <>
      <div
        onMouseDown={handlePointerDown}
        role="slider"
        aria-label="Rotate layer"
        aria-valuenow={angle}
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
      <input
        type="number"
        aria-label="Rotation angle in degrees"
        value={Math.round(angle)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const value = Number(e.target.value)
          if (Number.isFinite(value)) onAngleCommit(((value % 360) + 360) % 360)
        }}
        style={{
          position: 'absolute',
          top: -32,
          left: 'calc(50% + 20px)',
          width: 44,
          fontSize: 10,
          padding: '4px 6px',
          border: '1px solid var(--spectrum-global-color-gray-400)',
          borderRadius: 4,
          background: 'var(--spectrum-global-color-gray-50)',
          color: 'var(--spectrum-global-color-gray-900)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
        }}
      />
    </>
  )
}

// Renders the PSD's layers as draggable/resizable/rotatable boxes positioned by
// the manifest's bounds (in original PSD pixels), scaled down to fit the preview
// area. This is a DOM-based stand-in for a real compositor — layers show as
// their thumbnail/rendition, not truly rendered/blended pixels. Good enough to
// move/resize/rotate layers for a composite; not a pixel-accurate Photoshop
// preview.
export default function LayerCanvas ({ psdDocument, layers, selectedId, onSelect, onChange, disabled, canvasZoom = 1, onZoomChange }) {
  const canvasRef = useRef(null)

  // Ctrl/Cmd+scroll to zoom, same convention as Figma/Photoshop/every design
  // tool. Needs a real (non-passive) native listener, not React's onWheel —
  // React registers wheel listeners as passive by default, so e.preventDefault()
  // inside a JSX onWheel silently does nothing and the browser still zooms the
  // whole page. Trackpad pinch-zoom also arrives as a ctrlKey wheel event in
  // every major browser, so this covers that gesture too, not just an actual
  // physical Ctrl+scroll.
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !onZoomChange) return
    function handleWheel (e) {
      if (!e.ctrlKey) return
      e.preventDefault()
      onZoomChange(e.deltaY)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onZoomChange])
  // Live-tracks rotation while the handle is being dragged (before it's
  // committed via onChange) — same reasoning as the old liveResize tracking:
  // React state only needs to update once the gesture ends.
  const [liveRotate, setLiveRotate] = useState(null) // { layerId, angle }
  const [hoveredId, setHoveredId] = useState(null)
  // Live-tracks drag position the same way, so the box can visually snap to
  // canvas-center guides mid-drag (not just once you let go) without fighting
  // react-rnd's own internal drag tracking — see snapPosition below.
  const [liveDrag, setLiveDrag] = useState(null) // { layerId, x, y }
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false })
  // Live-tracks resize dimensions too — react-rnd resizes its own DOM box
  // directly during a drag (so the box visibly grows/shrinks live no matter
  // what), but a full-canvas layer's crop window (backgroundSize/Position
  // below) is computed from committed React state, which only updates on
  // onResizeStop. Without this, the box resizes live but the cropped image
  // inside it doesn't rescale to match until you let go — this feeds the
  // in-progress size into that same crop math on every tick instead.
  const [liveResize, setLiveResize] = useState(null) // { layerId, width, height }

  if (!psdDocument) return null

  // fitScale is the "100% zoom" baseline (document scaled to fit the preview
  // area); canvasZoom (a separate user-controlled multiplier, see the zoom
  // toolbar in SkuPersonalization.js) is layered on top of it as `scale`, and
  // every position/size conversion below uses `scale` — so zooming in/out
  // doesn't just change what's drawn, it changes the actual pixel-to-PSD-unit
  // ratio everything (drag, resize, snap, nudge) is computed in, which is what
  // keeps all the interaction math correct at any zoom level instead of
  // needing a separate "undo the zoom" step (e.g. a CSS transform: scale on
  // an ancestor would look right but throw off react-rnd's own drag math,
  // which reads raw mouse-movement pixels unaware of any ancestor transform).
  const fitScale = Math.min(MAX_CANVAS_WIDTH / psdDocument.width, MAX_CANVAS_HEIGHT / psdDocument.height, 1)
  const scale = fitScale * canvasZoom
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

  // Snaps a drag position to the canvas's own center guide (horizontal and/or
  // vertical independently) whenever the box's center lands within
  // SNAP_THRESHOLD_PX of it — cheap, no react-rnd guide-line support needed.
  function snapPosition (x, y, boxWidth, boxHeight) {
    const boxCenterX = x + boxWidth / 2
    const boxCenterY = y + boxHeight / 2
    const canvasCenterX = canvasWidth / 2
    const canvasCenterY = canvasHeight / 2
    const snapX = Math.abs(boxCenterX - canvasCenterX) < SNAP_THRESHOLD_PX
    const snapY = Math.abs(boxCenterY - canvasCenterY) < SNAP_THRESHOLD_PX
    return {
      x: snapX ? canvasCenterX - boxWidth / 2 : x,
      y: snapY ? canvasCenterY - boxHeight / 2 : y,
      snapX,
      snapY
    }
  }

  // Arrow keys nudge the selected layer (1px, or 10px with Shift); Escape/
  // Delete/Backspace just deselect — no destructive delete here, this is only
  // ever a selection clear. Needs the canvas to be focusable (tabIndex below)
  // since keydown only fires on/under whatever currently has focus.
  function handleKeyDown (e) {
    if (disabled) return
    if (e.key === 'Escape') { onSelect(null); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { onSelect(null); return }
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const dir = dirs[e.key]
    if (!dir || selectedId == null) return
    const layer = renderableLayers.find((l) => l.id === selectedId)
    if (!layer) return
    e.preventDefault()
    // Nudge amount is in canvas-preview pixels, same as a mouse drag — divided
    // by scale to land back in the original PSD-pixel units bounds are stored
    // in, same conversion onDragStop already does.
    const step = Math.round((e.shiftKey ? 10 : 1) / scale) || 1
    onChange(selectedId, {
      ...layer.bounds,
      left: layer.bounds.left + dir[0] * step,
      top: layer.bounds.top + dir[1] * step
    })
  }

  return (
    <div
      ref={canvasRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        width: canvasWidth,
        height: canvasHeight,
        // Without this, the flex-centered wrapper around this canvas
        // (SkuPersonalization.js) would try to shrink it to fit once
        // canvasZoom makes it bigger than the visible area, squishing the
        // whole preview instead of letting the ancestor scroll to it.
        flexShrink: 0,
        margin: '0 auto',
        overflow: 'hidden',
        outline: 'none',
        border: '1px solid var(--spectrum-global-color-gray-300)',
        // Checkerboard background stands in for PSD transparency.
        backgroundImage:
          'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
      }}
    >
      {snapGuides.x && (
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 0, borderLeft: '1px dashed var(--ulta-accent)', pointerEvents: 'none', zIndex: 2 }} />
      )}
      {snapGuides.y && (
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 0, borderTop: '1px dashed var(--ulta-accent)', pointerEvents: 'none', zIndex: 2 }} />
      )}

      {renderableLayers.map((layer) => {
        const boxWidth = layer.bounds.width * scale
        const boxHeight = layer.bounds.height * scale
        const isSelected = selectedId === layer.id
        const isHovered = hoveredId === layer.id
        const highlightFilter = isSelected ? SELECTED_GLOW_FILTER : (isHovered ? HOVER_GLOW_FILTER : undefined)
        const angle = liveRotate?.layerId === layer.id ? liveRotate.angle : (layer.bounds.rotate || 0)
        const isDraggingThis = liveDrag?.layerId === layer.id
        const isResizingThis = liveResize?.layerId === layer.id
        // Only the crop math needs the live-during-drag size — Rnd's own box
        // element already tracks its live size itself via direct DOM resize.
        const cropWidth = isResizingThis ? liveResize.width : boxWidth
        const cropHeight = isResizingThis ? liveResize.height : boxHeight

        // createRendition (actions/psd-manifest/index.js) sometimes returns the
        // layer's rendition at full document-canvas size (everything else
        // transparent) and sometimes a tight per-layer crop — verified per-layer
        // server-side (thumbnailIsFullCanvas), not assumed. Full-canvas needs
        // cropping out like a sprite sheet; a tight crop is just a normal image.
        const source = layer.sourceBounds || layer.bounds
        const zoomX = layer.thumbnailIsFullCanvas ? cropWidth / (source.width * scale) : 1
        const zoomY = layer.thumbnailIsFullCanvas ? cropHeight / (source.height * scale) : 1

        return (
          <Rnd
            key={layer.id}
            bounds="parent"
            disableDragging={disabled}
            enableResizing={!disabled}
            lockAspectRatio
            size={{ width: boxWidth, height: boxHeight }}
            position={isDraggingThis ? { x: liveDrag.x, y: liveDrag.y } : { x: layer.bounds.left * scale, y: layer.bounds.top * scale }}
            onDrag={(e, d) => {
              const snapped = snapPosition(d.x, d.y, boxWidth, boxHeight)
              setLiveDrag({ layerId: layer.id, x: snapped.x, y: snapped.y })
              setSnapGuides({ x: snapped.snapX, y: snapped.snapY })
            }}
            onDragStop={(e, d) => {
              const snapped = snapPosition(d.x, d.y, boxWidth, boxHeight)
              setLiveDrag(null)
              setSnapGuides({ x: false, y: false })
              onChange(layer.id, { ...layer.bounds, left: Math.round(snapped.x / scale), top: Math.round(snapped.y / scale) })
            }}
            onResize={(e, dir, ref) => setLiveResize({ layerId: layer.id, width: ref.offsetWidth, height: ref.offsetHeight })}
            onResizeStop={(e, dir, ref, delta, pos) => {
              setLiveResize(null)
              onChange(layer.id, {
                ...layer.bounds,
                width: Math.round(ref.offsetWidth / scale),
                height: Math.round(ref.offsetHeight / scale),
                left: Math.round(pos.x / scale),
                top: Math.round(pos.y / scale)
              })
            }}
            onMouseDown={() => onSelect(layer.id)}
            style={{
              // No rectangle border anymore — selection/hover is marked by a
              // glow filter on the image itself (see SELECTED_GLOW_FILTER /
              // HOVER_GLOW_FILTER), which hugs the PNG's actual silhouette
              // instead of its bounding box. A thin transparent border is kept
              // only for layers with no thumbnail at all (a text placeholder
              // has no alpha shape to glow), so those still get some visible
              // selection marker.
              border: !layer.thumbnail && isSelected ? '2px solid var(--ulta-accent)' : '2px solid transparent',
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
            <div
              style={{ position: 'relative', width: '100%', height: '100%' }}
              onMouseEnter={() => setHoveredId(layer.id)}
              onMouseLeave={() => setHoveredId((id) => (id === layer.id ? null : id))}
            >
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
                      filter: highlightFilter,
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
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      transform: `rotate(${angle}deg)`,
                      filter: highlightFilter
                    }}
                  />
                )}
              </div>
              {isSelected && !disabled && (
                <RotateHandle
                  angle={angle}
                  onRotateChange={(deg) => setLiveRotate({ layerId: layer.id, angle: deg })}
                  onRotateEnd={(deg) => {
                    setLiveRotate(null)
                    onChange(layer.id, { ...layer.bounds, rotate: deg })
                  }}
                  onAngleCommit={(deg) => onChange(layer.id, { ...layer.bounds, rotate: deg })}
                />
              )}
            </div>
          </Rnd>
        )
      })}
    </div>
  )
}
