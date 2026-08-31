import React, { useState } from 'react'
import { Text, ActionButton } from '@adobe/react-spectrum'
import Visibility from '@spectrum-icons/workflow/Visibility'
import VisibilityOff from '@spectrum-icons/workflow/VisibilityOff'
import DragHandle from '@spectrum-icons/workflow/DragHandle'

// ponytail: reordering is a flat-array move (native HTML5 drag-and-drop, no
// new dependency) and only changes paint order in the on-canvas preview
// (LayerCanvas renders in this same array's order) — it doesn't send a "move"
// operation to psd-composite, so Save Composite doesn't persist the new stack
// order into the actual PSD yet. Add that (an insertAbove/insertBelow edit per
// moved layer) if the preview-only reorder stops being enough.
// reorderDisabled is separate from `disabled` (which blocks all interaction,
// e.g. while saving) — it's specifically for when `layers` is a filtered
// subset (search text or "show only visible" active, see SkuPersonalization.js):
// dragging within a filtered view would splice the *filtered* array and hand
// back a reordered-but-incomplete list, silently dropping every layer the
// filter hid. Simplest safe fix is to just not allow reordering while a
// filter narrows what's shown, rather than reimplementing splice against the
// full array's index space.
export default function LayerList ({ layers, selectedId, onSelect, onToggleVisible, onReorder, disabled, reorderDisabled }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const canReorder = !disabled && !reorderDisabled

  function handleDrop (dropIndex) {
    if (!canReorder || dragIndex == null || dragIndex === dropIndex) return
    const next = [...layers]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(dropIndex, 0, moved)
    onReorder(next)
  }

  return (
    <div className="ulta-busy" data-disabled={disabled ? 'true' : 'false'} style={{ maxHeight: 560, overflowY: 'auto' }}>
      {layers.map((layer, index) => {
        const isGroup = layer.type === 'layerSection'
        const isSelected = selectedId === layer.id
        const isVisible = layer.visible !== false

        return (
          <div
            key={layer.id}
            draggable={canReorder}
            onClick={() => !disabled && onSelect(layer.id)}
            onDragStart={() => canReorder && setDragIndex(index)}
            onDragOver={(e) => { if (!canReorder) return; e.preventDefault(); if (overIndex !== index) setOverIndex(index) }}
            onDragLeave={() => setOverIndex((v) => (v === index ? null : v))}
            onDrop={(e) => { if (!canReorder) return; e.preventDefault(); handleDrop(index); setDragIndex(null); setOverIndex(null) }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 6px',
              paddingLeft: 6 + layer.depth * 14,
              cursor: disabled ? 'default' : 'pointer',
              borderRadius: 6,
              marginTop: isGroup && layer.depth === 0 ? 6 : 0,
              backgroundColor: isSelected ? 'var(--ulta-accent-soft)' : 'transparent',
              opacity: dragIndex === index ? 0.4 : 1,
              borderTop: overIndex === index && dragIndex !== index ? '2px solid var(--ulta-accent)' : '2px solid transparent',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--spectrum-global-color-gray-100)' }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {canReorder && (
              <DragHandle
                size="XS"
                UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-400)', flexShrink: 0, cursor: 'grab' }}
              />
            )}
            {!isGroup && (
              <ActionButton
                isQuiet
                isDisabled={disabled}
                onPress={() => onToggleVisible(layer.id)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                UNSAFE_style={{ minWidth: 0, width: 24, height: 24, flexShrink: 0 }}
              >
                {isVisible ? <Visibility size="XS" /> : <VisibilityOff size="XS" UNSAFE_style={{ opacity: 0.45 }} />}
              </ActionButton>
            )}
            <Text
              UNSAFE_style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: isGroup ? 11 : 13,
                fontWeight: isGroup ? 700 : (isSelected ? 600 : 500),
                textTransform: isGroup ? 'uppercase' : 'none',
                letterSpacing: isGroup ? 0.6 : 0,
                color: isGroup
                  ? 'var(--spectrum-global-color-gray-700)'
                  : (isVisible ? 'var(--spectrum-global-color-gray-900)' : 'var(--spectrum-global-color-gray-500)')
              }}
            >
              {layer.name}
            </Text>
          </div>
        )
      })}
    </div>
  )
}
