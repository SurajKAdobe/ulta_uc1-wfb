import React, { useRef, useState } from 'react'
import { View, Flex, Text, ActionButton, ProgressCircle, DialogTrigger, Dialog, Heading, Divider, Content, ButtonGroup, Button } from '@adobe/react-spectrum'
import Close from '@spectrum-icons/workflow/Close'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import ChevronUp from '@spectrum-icons/workflow/ChevronUp'
import Maximize from '@spectrum-icons/workflow/Maximize'
import { formatSize } from '../CsvUpload/CsvUpload'
import CsvPreviewTable from '../CsvUpload/CsvPreviewTable'

// CsvUpload.js's multi-column table preview is built for SkuCompilation's much
// wider column — crammed into this 260px sidebar it just overflows/scrolls
// horizontally and looks broken. This is a narrow-column-appropriate stand-in:
// same drop zone, but the preview is a single scrollable list of one-line
// summaries (every non-empty cell joined and ellipsis-truncated) instead of a
// wide grid. UC4's CSV also has no header row (see utils/csv.js parseUc4Csv),
// so there's no column names to show as headers anyway.
export default function Uc4CsvUpload ({ value, isUploading, error, disabled, onSelect, onRemove }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

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
          aria-label="Drop CSV file here or browse files"
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        >
          <Flex direction="column" alignItems="center" gap="size-50">
            {isUploading
              ? <ProgressCircle aria-label="Reading CSV" isIndeterminate size="M" />
              : (
                <>
                  <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13 }}>Drop CSV file here</Text>
                  <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>or Browse files</Text>
                </>
                )}
          </Flex>
          <input ref={inputRef} type="file" accept=".csv" hidden disabled={disabled} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {value && (
        <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-150" UNSAFE_className="ulta-fade-in">
          <Flex justifyContent="space-between" alignItems="center" gap="size-100">
            <Text
              UNSAFE_style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              ✓ {value.fileName}
            </Text>
            <ActionButton isQuiet onPress={onRemove} aria-label="Remove CSV" UNSAFE_style={{ minWidth: 0, width: 22, height: 22, flexShrink: 0 }}>
              <Close size="XS" />
            </ActionButton>
          </Flex>

          <Flex justifyContent="space-between" alignItems="center" marginTop="size-50">
            <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
              {formatSize(value.size)} · {value.recordCount} records
            </Text>
            {value.previewRows?.length > 0 && (
              <Flex gap="size-50" alignItems="center">
                <DialogTrigger type="modal">
                  <ActionButton isQuiet aria-label="View full CSV" UNSAFE_style={{ minWidth: 0, width: 22, height: 22 }}>
                    <Maximize size="XS" />
                  </ActionButton>
                  {(close) => (
                    <Dialog size="L">
                      <Heading>{value.fileName}</Heading>
                      <Divider />
                      <Content>
                        <CsvPreviewTable
                          headers={value.headers}
                          rows={value.previewRows}
                          resetKey={`${value.fileName}-${value.size}`}
                          maxHeight="60vh"
                        />
                      </Content>
                      <ButtonGroup>
                        <Button variant="secondary" onPress={close}>Close</Button>
                      </ButtonGroup>
                    </Dialog>
                  )}
                </DialogTrigger>
                <ActionButton isQuiet onPress={() => setShowPreview((v) => !v)} UNSAFE_style={{ minWidth: 0, height: 22 }}>
                  <Flex gap="size-50" alignItems="center">
                    {showPreview ? <ChevronUp size="XS" /> : <ChevronDown size="XS" />}
                    <Text UNSAFE_style={{ fontSize: 11 }}>Preview</Text>
                  </Flex>
                </ActionButton>
              </Flex>
            )}
          </Flex>

          {showPreview && (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
              {value.previewRows.map((row, i) => (
                <div
                  key={i}
                  className="ulta-table-row"
                  style={{ display: 'flex', gap: 6, padding: '4px 2px', animationDelay: `${i * 25}ms` }}
                >
                  <Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-gray-600)', flexShrink: 0, minWidth: 14 }}>
                    {i + 1}.
                  </Text>
                  <Text
                    UNSAFE_style={{ fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={row.filter(Boolean).join(' · ')}
                  >
                    {row.filter(Boolean).join(' · ')}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </View>
      )}

      {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
    </View>
  )
}
