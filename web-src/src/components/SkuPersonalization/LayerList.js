import React from 'react'
import { Text, ActionButton } from '@adobe/react-spectrum'
import Visibility from '@spectrum-icons/workflow/Visibility'
import VisibilityOff from '@spectrum-icons/workflow/VisibilityOff'

export default function LayerList ({ layers, selectedId, onSelect, onToggleVisible }) {
  return (
    <div style={{ maxHeight: 560, overflowY: 'auto' }}>
      {layers.map((layer) => {
        const isGroup = layer.type === 'layerSection'
        const isSelected = selectedId === layer.id
        const isVisible = layer.visible !== false

        return (
          <div
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 6px',
              paddingLeft: 6 + layer.depth * 14,
              cursor: 'pointer',
              borderRadius: 6,
              marginTop: isGroup && layer.depth === 0 ? 6 : 0,
              backgroundColor: isSelected ? 'var(--ulta-accent-soft)' : 'transparent',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--spectrum-global-color-gray-100)' }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {!isGroup && (
              <ActionButton
                isQuiet
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
