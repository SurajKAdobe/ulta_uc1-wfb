import React from 'react'
import { Text, ActionButton } from '@adobe/react-spectrum'
import Close from '@spectrum-icons/workflow/Close'
import Checkmark from '@spectrum-icons/workflow/Checkmark'
import Alert from '@spectrum-icons/workflow/Alert'
import Download from '@spectrum-icons/workflow/Download'

// One row per open PSD — click to make it the active document (LAYERS panel and
// PREVIEW canvas below both follow whichever one is active). Each document keeps
// its own upload/manifest/edit state independently (see SkuPersonalization.js).
export default function PsdList ({ documents, activeId, onSelect, onRemove }) {
  if (documents.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {documents.map((doc, index) => {
        const isActive = doc.id === activeId
        const isBusy = doc.uploading || doc.manifestLoading
        const hasError = !!(doc.uploadError || doc.manifestError)

        return (
          <div
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${isActive ? 'var(--ulta-accent)' : 'var(--spectrum-global-color-gray-300)'}`,
              backgroundColor: isActive ? 'var(--ulta-accent-soft)' : 'var(--spectrum-global-color-gray-75)',
              transition: 'background-color 0.15s ease, border-color 0.15s ease'
            }}
          >
            <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)', flexShrink: 0, minWidth: 14 }}>
              {index + 1}.
            </Text>
            {isBusy
              ? <div className="ulta-skeleton" aria-label="Loading" role="img" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }} />
              : hasError
                ? <Alert size="S" UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)' }} />
                : <Checkmark size="S" UNSAFE_style={{ color: 'var(--spectrum-global-color-green-700)' }} />}
            <Text
              UNSAFE_style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500
              }}
            >
              {doc.fileName}
            </Text>
            {doc.downloaded && (
              <Download
                size="XS"
                aria-label="Downloaded"
                UNSAFE_style={{ color: 'var(--spectrum-global-color-green-700)', flexShrink: 0 }}
              />
            )}
            <ActionButton
              isQuiet
              onPress={() => onRemove(doc.id)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Remove ${doc.fileName}`}
              UNSAFE_style={{ minWidth: 0, width: 22, height: 22, flexShrink: 0 }}
            >
              <Close size="XS" />
            </ActionButton>
          </div>
        )
      })}
    </div>
  )
}
