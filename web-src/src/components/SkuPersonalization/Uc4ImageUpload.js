import React, { useRef, useState } from 'react'
import { View, Flex, Text, ActionButton, ProgressCircle } from '@adobe/react-spectrum'
import Close from '@spectrum-icons/workflow/Close'

// Single-image drop zone for UC4's background image (node 3) — one file, reused
// for every row in the batch. The CSV's own image-url column can't be used
// directly: it points at a protected monday.com asset that 406s when this app's
// backend tries to fetch it server-side (no session/auth to present), so the
// user supplies the image manually instead.
export default function Uc4ImageUpload ({ value, isUploading, error, disabled, onSelect, onRemove }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleFiles (files) {
    if (disabled) return
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onSelect(null, 'Only image files are supported.')
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
          aria-label="Drop background image here or browse files"
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        >
          <Flex direction="column" alignItems="center" gap="size-50">
            {isUploading
              ? <ProgressCircle aria-label="Uploading image" isIndeterminate size="M" />
              : (
                <>
                  <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13 }}>Drop background image here</Text>
                  <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>or Browse files</Text>
                </>
                )}
          </Flex>
          <input ref={inputRef} type="file" accept="image/*" hidden disabled={disabled} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {value && (
        <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-100" UNSAFE_className="ulta-fade-in">
          <img
            src={value.previewUrl}
            alt=""
            style={{ width: '100%', height: 140, objectFit: 'contain', borderRadius: 4, background: 'var(--spectrum-global-color-gray-100)', display: 'block' }}
          />
          <Flex alignItems="center" gap="size-100" marginTop="size-100">
            <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✓ {value.fileName}
            </Text>
            <ActionButton isQuiet onPress={onRemove} aria-label="Remove background image" UNSAFE_style={{ minWidth: 0, width: 22, height: 22, flexShrink: 0 }}>
              <Close size="XS" />
            </ActionButton>
          </Flex>
        </View>
      )}

      {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
    </View>
  )
}
