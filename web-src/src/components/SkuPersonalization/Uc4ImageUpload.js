import React, { useRef, useState } from 'react'
import { View, Flex, Text, ActionButton, ProgressCircle, TextArea, Button } from '@adobe/react-spectrum'
import Close from '@spectrum-icons/workflow/Close'

// Single-image drop zone for UC4's background image (node 3) — one file, reused
// for every row in the batch. The CSV's own image-url column can't be used
// directly: it points at a protected monday.com asset that 406s when this app's
// backend tries to fetch it server-side (no session/auth to present), so the
// user supplies the image manually instead.
export default function Uc4ImageUpload ({
  value,
  isUploading,
  error,
  disabled,
  onSelect,
  onRemove,
  prompt,
  onPromptChange,
  isGenerating,
  generationStatus,
  generationError,
  onGenerate
}) {
  const inputRef = useRef(null)
  const previewRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handlePreviewPointerMove (event) {
    if (event.pointerType === 'touch' || !previewRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    const frame = previewRef.current
    frame.style.setProperty('--parallax-x', `${((x - 0.5) * 10).toFixed(2)}px`)
    frame.style.setProperty('--parallax-y', `${((y - 0.5) * 8).toFixed(2)}px`)
    frame.style.setProperty('--parallax-rotate-x', `${((0.5 - y) * 4).toFixed(2)}deg`)
    frame.style.setProperty('--parallax-rotate-y', `${((x - 0.5) * 5).toFixed(2)}deg`)
    frame.style.setProperty('--parallax-glare-x', `${(x * 100).toFixed(1)}%`)
    frame.style.setProperty('--parallax-glare-y', `${(y * 100).toFixed(1)}%`)
    frame.dataset.parallaxActive = 'true'
  }

  function resetPreviewParallax () {
    if (!previewRef.current) return
    const frame = previewRef.current
    frame.dataset.parallaxActive = 'false'
    frame.style.setProperty('--parallax-x', '0px')
    frame.style.setProperty('--parallax-y', '0px')
    frame.style.setProperty('--parallax-rotate-x', '0deg')
    frame.style.setProperty('--parallax-rotate-y', '0deg')
    frame.style.setProperty('--parallax-glare-x', '50%')
    frame.style.setProperty('--parallax-glare-y', '50%')
  }

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
    <View UNSAFE_className="ulta-background-upload-root">
      {!value && (
        <div className="ulta-background-input-card">
          <div className="ulta-firefly-generator">
            <Flex direction="column" gap="size-75" UNSAFE_className="ulta-firefly-generator-content">
              <Flex justifyContent="space-between" alignItems="center" gap="size-100">
                <Text UNSAFE_className="ulta-firefly-generator-title">Generate with Firefly</Text>
                <span className="ulta-firefly-model-badge">ULTA UC4 MODEL</span>
              </Flex>
              <div className="ulta-firefly-composer">
                <TextArea
                  aria-label="Describe the generated background"
                  placeholder="Describe a clean beauty campaign background..."
                  value={prompt}
                  onChange={onPromptChange}
                  maxLength={1500}
                  isDisabled={disabled || isGenerating}
                  width="100%"
                  UNSAFE_className="ulta-firefly-prompt"
                />
                <Button
                  variant="accent"
                  onPress={onGenerate}
                  isDisabled={disabled || !prompt?.trim() || isGenerating}
                  aria-label="Generate background with Firefly"
                  UNSAFE_className="ulta-firefly-generate-button"
                >
                  {isGenerating
                    ? <ProgressCircle aria-label="Generating background" isIndeterminate size="S" />
                    : 'Generate'}
                </Button>
              </div>
              {generationStatus && <Text UNSAFE_className="ulta-firefly-status">{generationStatus}</Text>}
              {generationError && <Text UNSAFE_className="ulta-firefly-error">{generationError}</Text>}
            </Flex>
          </div>
          <div className="ulta-firefly-or-divider"><span>OR UPLOAD</span></div>
          <div
            className="ulta-busy ulta-dropzone"
            data-disabled={disabled || isGenerating ? 'true' : 'false'}
            style={{
              border: `1px dashed ${isDragOver ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
              borderRadius: 'var(--spectrum-alias-border-radius-regular, 4px)',
              padding: 'var(--spectrum-global-dimension-size-200, 16px)',
              backgroundColor: isDragOver ? 'var(--ulta-accent-soft)' : 'var(--spectrum-global-color-gray-75)',
              textAlign: 'center',
              cursor: disabled || isGenerating ? 'default' : 'pointer',
              transition: 'background-color 0.2s ease, border-color 0.2s ease'
            }}
            onDragOver={(e) => { e.preventDefault(); if (!disabled && !isGenerating) setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (!isGenerating) handleFiles(e.dataTransfer.files) }}
            onClick={() => !disabled && !isGenerating && inputRef.current?.click()}
            role="button"
            tabIndex={disabled || isGenerating ? -1 : 0}
            aria-label="Drop background image here or browse files"
            onKeyDown={(e) => { if (!disabled && !isGenerating && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
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
            <input ref={inputRef} type="file" accept="image/*" hidden disabled={disabled || isGenerating} onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
      )}

      {value && (
        <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-100" UNSAFE_className="ulta-fade-in ulta-asset-card ulta-image-upload-card">
          <div
            ref={previewRef}
            className="ulta-background-preview-frame"
            data-parallax-active="false"
            onPointerMove={handlePreviewPointerMove}
            onPointerLeave={resetPreviewParallax}
            aria-hidden="true"
          >
            <img
              src={value.previewUrl}
              alt=""
              className="ulta-background-thumbnail"
            />
          </div>
          <Flex alignItems="center" marginTop="size-100" UNSAFE_className="ulta-image-file-actions">
            <Flex alignItems="center" gap="size-100" UNSAFE_className="ulta-image-file-row">
              <Text UNSAFE_className="ulta-image-file-name" title={value.fileName}>{value.fileName}</Text>
              <ActionButton isQuiet onPress={onRemove} aria-label="Remove background image" UNSAFE_className="ulta-image-remove-button" UNSAFE_style={{ minWidth: 0, width: 22, height: 22, flexShrink: 0 }}>
                <Close size="XS" />
              </ActionButton>
            </Flex>
          </Flex>
        </View>
      )}

      {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
    </View>
  )
}
