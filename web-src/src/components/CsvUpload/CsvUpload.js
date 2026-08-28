import React, { useRef, useState } from 'react'
import { View, Flex, Text, Button, ProgressCircle } from '@adobe/react-spectrum'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import ChevronUp from '@spectrum-icons/workflow/ChevronUp'
import CsvPreviewTable from './CsvPreviewTable'

export function formatSize (bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Reusable CSV drag-and-drop upload control.
// value: { fileName, size, recordCount, headers, previewRows } | null
export default function CsvUpload ({ value, isUploading, error, disabled, onSelect, onRemove }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  function handleFiles (files) {
    if (disabled) return
    const file = files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onSelect(null, 'Only CSV files are supported.')
      return
    }
    onSelect(file, null)
  }

  const hasPreview = value?.headers?.length > 0

  return (
    <View>
      {!value && (
        // Plain <div> for the drop surface — Spectrum's View filters onDrop/onDragOver/
        // onDragLeave out through its DOM prop allowlist, so drag-and-drop never fires
        // on it (same reason pw-scripts' DropZone.tsx avoids Spectrum layout primitives here).
        <div
          className="ulta-busy"
          data-disabled={disabled ? 'true' : 'false'}
          style={{
            border: `1px dashed ${isDragOver ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
            borderRadius: 'var(--spectrum-alias-border-radius-regular, 4px)',
            padding: 'var(--spectrum-global-dimension-size-400, 32px)',
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
          aria-label="Drop CSV file here or browse files"
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        >
          <Flex direction="column" alignItems="center" gap="size-100">
            {isUploading
              ? <ProgressCircle aria-label="Uploading CSV" isIndeterminate size="M" />
              : (
                <>
                  <Text UNSAFE_style={{ fontWeight: 600 }}>Drop CSV file here</Text>
                  <Text>or Browse files</Text>
                  <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)' }}>CSV files only</Text>
                </>
                )}
          </Flex>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            disabled={disabled}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {value && (
        <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-200" UNSAFE_className="ulta-fade-in">
          <Flex direction="row" justifyContent="space-between" alignItems="center">
            <Flex direction="column">
              <Flex direction="row" alignItems="center" gap="size-100">
                <Text UNSAFE_style={{ fontWeight: 600 }}>✓ {value.fileName}</Text>
                {value.recordCount != null && (
                  <span className="ulta-pill">{value.recordCount} records</span>
                )}
              </Flex>
              <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)' }}>
                {formatSize(value.size)}
              </Text>
            </Flex>
            <Flex gap="size-100" alignItems="center">
              {hasPreview && (
                // Always interactive, even mid-execution — viewing what was submitted
                // shouldn't be blocked just because Replace/Remove are (that would
                // mutate the in-flight batch's input).
                <Button variant="secondary" style="outline" onPress={() => setShowPreview(v => !v)}>
                  {showPreview ? <ChevronUp /> : <ChevronDown />}
                  <Text>Preview</Text>
                </Button>
              )}
              <Flex gap="size-100" UNSAFE_className="ulta-busy" data-disabled={disabled ? 'true' : 'false'}>
                <Button variant="secondary" isDisabled={disabled} onPress={() => inputRef.current?.click()}>Replace</Button>
                <Button variant="negative" style="outline" isDisabled={disabled} onPress={onRemove}>Remove</Button>
              </Flex>
            </Flex>
          </Flex>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            disabled={disabled}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {showPreview && hasPreview && (
            <View marginTop="size-150" UNSAFE_className="ulta-preview-panel">
              <CsvPreviewTable headers={value.headers} rows={value.previewRows} resetKey={`${value.fileName}-${value.size}`} />
            </View>
          )}
        </View>
      )}

      {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
    </View>
  )
}
