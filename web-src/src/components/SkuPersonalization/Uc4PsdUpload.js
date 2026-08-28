import React, { useRef, useState } from 'react'
import { View, Flex, Text, ActionButton, ProgressCircle } from '@adobe/react-spectrum'
import Close from '@spectrum-icons/workflow/Close'

// Template PSD drop zone (node 1) — one file, reused for every row in the batch.
// Structurally identical to Uc4ImageUpload, just validates .psd instead of image/*.
export default function Uc4PsdUpload ({ value, isUploading, error, disabled, onSelect, onRemove }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleFiles (files) {
    if (disabled) return
    const file = files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.psd')) {
      onSelect(null, 'Only .psd files are supported.')
      return
    }
    onSelect(file, null)
  }

  return (
    <View>
      {!value && (
        <div
          className="ulta-busy"
          data-disabled={disabled ? 'true' : 'false'}
          style={{
            border: `1px dashed ${isDragOver ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
            borderRadius: 'var(--spectrum-alias-border-radius-regular, 4px)',
            padding: 'var(--spectrum-global-dimension-size-200, 16px)',
            backgroundColor: isDragOver ? 'var(--ulta-accent-soft)' : 'var(--spectrum-global-color-gray-75)',
            textAlign: 'center',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'background-color 0.2s ease, border-color 0.2s ease'
          }}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => !disabled && inputRef.current?.click()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Drop template PSD here or browse files"
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        >
          <Flex direction="column" alignItems="center" gap="size-50">
            {isUploading
              ? <ProgressCircle aria-label="Uploading PSD" isIndeterminate size="M" />
              : (
                <>
                  <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13 }}>Drop template PSD here</Text>
                  <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>or Browse files</Text>
                </>
                )}
          </Flex>
          <input ref={inputRef} type="file" accept=".psd" hidden disabled={disabled} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {value && (
        <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-100" UNSAFE_className="ulta-fade-in">
          <Flex alignItems="center" gap="size-100">
            <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✓ {value.fileName}
            </Text>
            <ActionButton isQuiet onPress={onRemove} aria-label="Remove template PSD" UNSAFE_style={{ minWidth: 0, width: 22, height: 22, flexShrink: 0 }}>
              <Close size="XS" />
            </ActionButton>
          </Flex>
        </View>
      )}

      {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
    </View>
  )
}
