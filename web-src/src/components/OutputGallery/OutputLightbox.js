import React, { useCallback, useEffect } from 'react'
import { DialogContainer, Dialog, Content, Flex, Text, ActionButton, Link } from '@adobe/react-spectrum'
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft'
import ChevronRight from '@spectrum-icons/workflow/ChevronRight'
import Download from '@spectrum-icons/workflow/Download'
import Close from '@spectrum-icons/workflow/Close'
import FolderOpen from '@spectrum-icons/workflow/FolderOpen'
import { PS_ICON_DATA_URI } from '../../assets/psIcon'

// Full-size viewer for one row's PNG, with prev/next to step through every row
// in the batch without closing and reopening. PSD isn't browser-renderable, so
// it's offered as a download action alongside the image instead of a slide.
export default function OutputLightbox ({ executions, rowLabels, index, onClose, onNavigate }) {
  const isOpen = index != null
  const current = isOpen ? executions[index] : null
  const canPrev = isOpen && index > 0
  const canNext = isOpen && index < executions.length - 1

  const goPrev = useCallback(() => { if (canPrev) onNavigate(index - 1) }, [canPrev, index, onNavigate])
  const goNext = useCallback(() => { if (canNext) onNavigate(index + 1) }, [canNext, index, onNavigate])

  useEffect(() => {
    if (!isOpen) return
    function handleKey (e) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, goPrev, goNext])

  return (
    <DialogContainer type="fullscreenTakeover" onDismiss={onClose} isDismissable>
      {isOpen && (
        <Dialog>
          <Content UNSAFE_className="ulta-lightbox">
            <ActionButton
              UNSAFE_className="ulta-lightbox-close"
              isQuiet
              onPress={onClose}
              aria-label="Close"
            >
              <Close size="M" />
            </ActionButton>

            <div className="ulta-lightbox-stage">
              {canPrev && (
                <ActionButton UNSAFE_className="ulta-lightbox-nav ulta-lightbox-nav-left" isQuiet onPress={goPrev} aria-label="Previous asset">
                  <ChevronLeft size="L" />
                </ActionButton>
              )}

              {current?.png
                ? <img src={current.png.url} alt={rowLabels?.[current?.index] || `Asset ${index + 1}`} className="ulta-lightbox-image" />
                : <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-600)' }}>No PNG preview for this asset.</Text>}

              {canNext && (
                <ActionButton UNSAFE_className="ulta-lightbox-nav ulta-lightbox-nav-right" isQuiet onPress={goNext} aria-label="Next asset">
                  <ChevronRight size="L" />
                </ActionButton>
              )}
            </div>

            <Flex justifyContent="space-between" alignItems="center" UNSAFE_className="ulta-lightbox-footer">
              <Text UNSAFE_style={{ fontSize: 13, fontWeight: 600 }}>
                {rowLabels?.[current?.index] || `Asset ${index + 1}`}
              </Text>
              <Flex gap="size-200" alignItems="center">
                <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
                  {index + 1} / {executions.length}
                </Text>
                {current?.psd && (
                  <Link href={current.psd.url} target="_blank" rel="noopener noreferrer" UNSAFE_style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <img src={PS_ICON_DATA_URI} alt="" className="ulta-psd-icon" /> PSD <Download size="XS" />
                  </Link>
                )}
                {current?.acpFolderUrl && (
                  <Link href={current.acpFolderUrl} target="_blank" rel="noopener noreferrer" UNSAFE_style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <FolderOpen size="XS" /> Open in ACP
                  </Link>
                )}
              </Flex>
            </Flex>
          </Content>
        </Dialog>
      )}
    </DialogContainer>
  )
}
