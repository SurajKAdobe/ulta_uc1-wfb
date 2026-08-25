import React, { useRef, useState } from 'react'
import { Flex, Text, ProgressCircle } from '@adobe/react-spectrum'
import { PS_ICON_DATA_URI } from '../../assets/psIcon'

// Plain <div> for the drop surface — Spectrum's View filters onDrop/onDragOver/onClick
// unreliably through its DOM prop allowlist (same reason CsvUpload uses a div too).
// Controlled component — upload state lives in App.js so the resulting presigned URLs
// can be sent to the ulta-datamerge-select-layer node on execute.
export default function TemplateSlot ({ label, value, isUploading, error, disabled, onSelect }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleFile (file) {
    if (disabled || !file) return
    if (!file.name.toLowerCase().endsWith('.psd')) {
      onSelect(null, 'Only PSD files are supported.')
      return
    }
    onSelect(file, null)
  }

  return (
    <div
      className="ulta-busy"
      data-disabled={disabled ? 'true' : 'false'}
      style={{
        border: `1px dashed ${error ? 'var(--spectrum-global-color-red-400)' : isDragOver ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
        borderRadius: 4,
        padding: 'var(--spectrum-global-dimension-size-150, 12px)',
        backgroundColor: isDragOver ? 'var(--ulta-accent-soft)' : 'var(--spectrum-global-color-gray-50)',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        minHeight: 68,
        transition: 'background-color 0.2s ease, border-color 0.2s ease'
      }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files?.[0] || null) }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Upload PSD for ${label}`}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
    >
      <Flex direction="column" alignItems="center" justifyContent="center" gap="size-50" height="100%">
        <Flex alignItems="center" gap="size-75">
          <img src={PS_ICON_DATA_URI} alt="" className="ulta-psd-icon" />
          <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13 }}>{label}</Text>
        </Flex>
        {isUploading
          ? <ProgressCircle aria-label={`Uploading ${label}`} isIndeterminate size="S" />
          : (
            <Text UNSAFE_style={{ fontSize: 11, color: value ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-600)' }}>
              {value ? `✓ ${value.fileName}` : '+ Upload PSD'}
            </Text>
            )}
        {error && <Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-red-600)' }}>{error}</Text>}
      </Flex>
      <input
        ref={inputRef}
        type="file"
        accept=".psd"
        hidden
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
    </div>
  )
}
