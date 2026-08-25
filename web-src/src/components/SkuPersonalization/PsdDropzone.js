import React, { useRef, useState } from 'react'
import { Flex, Text } from '@adobe/react-spectrum'

// Same drop-surface pattern as CsvUpload.js — a plain <div> (not a Spectrum View)
// because Spectrum filters onDrop/onDragOver/onDragLeave out of its DOM prop allowlist.
// Always visible (not hidden once a file exists) — this is an "add another PSD"
// control now that the sidebar (PsdList) tracks multiple open documents.
export default function PsdDropzone ({ onSelect }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleFiles (fileList) {
    const all = Array.from(fileList || [])
    if (all.length === 0) return
    const psds = all.filter((f) => f.name.toLowerCase().endsWith('.psd'))
    const skipped = all.length - psds.length
    onSelect(psds, skipped > 0 ? `${skipped} file(s) skipped — only .psd files are supported.` : null)
  }

  return (
    <div
      style={{
        border: `1px dashed ${isDragOver ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
        borderRadius: 'var(--spectrum-alias-border-radius-regular, 4px)',
        padding: 'var(--spectrum-global-dimension-size-200, 16px)',
        backgroundColor: isDragOver ? 'var(--ulta-accent-soft)' : 'var(--spectrum-global-color-gray-50)',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease, border-color 0.2s ease'
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Drop PSD files here or browse files"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
    >
      <Flex direction="column" alignItems="center" gap="size-50">
        <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13 }}>Drop PSD files here</Text>
        <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>or Browse files · multiple allowed</Text>
      </Flex>
      <input
        ref={inputRef}
        type="file"
        accept=".psd"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
