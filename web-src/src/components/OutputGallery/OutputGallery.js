import React, { useState } from 'react'
import { View, Flex, Text, ActionButton, Link } from '@adobe/react-spectrum'
import Visibility from '@spectrum-icons/workflow/Visibility'
import FolderOpen from '@spectrum-icons/workflow/FolderOpen'
import { PS_ICON_DATA_URI } from '../../assets/psIcon'
import OutputLightbox from './OutputLightbox'

// One compact card per CSV row: the PNG renders directly as a full-bleed
// thumbnail, and two small icon buttons (view / PSD) both open the same
// full-screen lightbox — clicking either just changes which slide it opens on.
function OutputCard ({ label, png, hasPsd, acpFolderUrl, delay, onOpen }) {
  return (
    <View
      UNSAFE_className="ulta-output-card ulta-fade-in"
      UNSAFE_style={{ animationDelay: `${delay}ms` }}
      borderWidth="thin"
      borderColor="gray-300"
      borderRadius="medium"
      overflow="hidden"
    >
      <button type="button" className="ulta-output-thumb-btn" onClick={onOpen} aria-label={`Preview ${label}`}>
        {png
          ? <img src={png.url} alt={label} className="ulta-output-thumb" />
          : <Flex height="100%" alignItems="center" justifyContent="center"><Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-gray-600)' }}>No PNG</Text></Flex>}
        <span className="ulta-output-thumb-overlay"><Visibility size="M" /></span>
      </button>

      <Flex direction="column" gap="size-50" UNSAFE_className="ulta-output-meta">
        <Text UNSAFE_style={{ fontSize: 11, fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </Text>
        <Flex gap="size-50" alignItems="center" wrap>
          {hasPsd && (
            <ActionButton isQuiet UNSAFE_className="ulta-psd-badge" onPress={onOpen}>
              <img src={PS_ICON_DATA_URI} alt="" className="ulta-psd-icon" />
              <Text UNSAFE_style={{ fontSize: 10 }}>PSD</Text>
            </ActionButton>
          )}
          {acpFolderUrl && (
            <Link href={acpFolderUrl} target="_blank" rel="noopener noreferrer" UNSAFE_className="ulta-psd-badge" aria-label={`Open ${label} in ACP`}>
              <FolderOpen size="XS" />
              <Text UNSAFE_style={{ fontSize: 10 }}>Folder</Text>
            </Link>
          )}
        </Flex>
      </Flex>
    </View>
  )
}

// executions: [{ index, psd: {url,name}|null, png: {url,name}|null }] from extractOutputAssets.
// rowLabels: filenames in the same order as the CSV rows submitted, used as captions.
export default function OutputGallery ({ executions, rowLabels }) {
  const [openIndex, setOpenIndex] = useState(null)

  if (!executions || executions.length === 0) return null

  return (
    <>
      <div className="ulta-output-strip">
        {executions.map(({ index, psd, png, acpFolderUrl }, pos) => (
          <OutputCard
            key={index}
            label={rowLabels?.[index] || `Asset ${index + 1}`}
            png={png}
            hasPsd={Boolean(psd)}
            acpFolderUrl={acpFolderUrl}
            delay={pos * 40}
            onOpen={() => setOpenIndex(pos)}
          />
        ))}
      </div>
      <OutputLightbox
        executions={executions}
        rowLabels={rowLabels}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onNavigate={setOpenIndex}
      />
    </>
  )
}
