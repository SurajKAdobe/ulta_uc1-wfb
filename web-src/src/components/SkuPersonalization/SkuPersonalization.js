import React, { useRef, useState } from 'react'
import { View, Flex, Heading, Text, Button, ActionButton, MenuTrigger, Menu, Item, DialogTrigger, Dialog, Content, Divider, ButtonGroup, SearchField } from '@adobe/react-spectrum'
import UndoIcon from '@spectrum-icons/workflow/Undo'
import RedoIcon from '@spectrum-icons/workflow/Redo'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import Visibility from '@spectrum-icons/workflow/Visibility'
import VisibilityOff from '@spectrum-icons/workflow/VisibilityOff'
import CloseIcon from '@spectrum-icons/workflow/Close'
import ZoomIn from '@spectrum-icons/workflow/ZoomIn'
import ZoomOut from '@spectrum-icons/workflow/ZoomOut'
import PsdList from './PsdList'
import Uc4Workflow from './Uc4Workflow'
import LayerCanvas from './LayerCanvas'
import LayerList from './LayerList'
import { getPsdManifest, saveComposite, harmonizeComposite } from '../../services/psdService'
import { exportPsdToCanvas, syncPsdFromCanvas, exportableLayers } from '../../services/figmaCanvasService'
import { createHistory, historyState, pushHistory, undoHistory, redoHistory, canUndoHistory, canRedoHistory } from '../../utils/layerHistory'

// Only the Figma plugin build has a canvas to export to — the plain web app
// keeps using the DOM-based LayerCanvas editor below unchanged.
const IS_FIGMA_PLUGIN = typeof window !== 'undefined' && !!window.__FIGMA_PLUGIN__

function SectionHeading ({ children }) {
  return (
    <Heading level={4} margin={0} UNSAFE_style={{ letterSpacing: 1, color: 'var(--spectrum-global-color-gray-700)', fontSize: 12 }}>
      {children}
    </Heading>
  )
}

// Each open PSD is one entry in `documents`, independently tracking its own
// upload/manifest/edit/save state — the LAYERS panel and PREVIEW canvas always
// reflect whichever one is currently `activeId`.
export default function SkuPersonalization () {
  const [documents, setDocuments] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [uc4Running, setUc4Running] = useState(false)
  const [layerSearch, setLayerSearch] = useState('')
  const [showOnlyVisible, setShowOnlyVisible] = useState(false)
  const nextIdRef = useRef(0)
  // Serializes the manifest+rendition step across documents — uploads (S3 PUTs)
  // still run in parallel below, but each getPsdManifest call already fires N
  // parallel Photoshop createRendition jobs internally; letting multiple
  // documents do that at once multiplies concurrent Photoshop API load enough to
  // cause flaky failures (which show up as a layer not rendering, or rendering
  // at the wrong position, until something forces a re-render). Chained promise
  // errors are swallowed here so one failed document doesn't block the next.
  const manifestQueueRef = useRef(Promise.resolve())

  const activeDoc = documents.find((d) => d.id === activeId) || null
  const activeLayers = activeDoc?.history ? historyState(activeDoc.history) : []
  const hasDocument = !!activeDoc?.psdDocument
  // ponytail: filters the flat list directly, so a group header can disappear
  // from a text search even while a still-matching child stays visible under
  // it (no re-parenting/re-nesting logic) — acceptable for a first cut, only
  // worth fixing if that ends up actually confusing in practice.
  const visibleLayers = activeLayers.filter((l) => {
    if (showOnlyVisible && l.type !== 'layerSection' && l.visible === false) return false
    if (layerSearch && !l.name.toLowerCase().includes(layerSearch.toLowerCase())) return false
    return true
  })

  function updateDoc (id, patch) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d)))
  }

  // Shared by both entry points below (a locally-uploaded file, or a PSD url
  // handed back by the UC4 workflow) — everything past "we have a presignedUrl"
  // is identical either way.
  async function loadManifestFor (id, presignedUrl) {
    try {
      updateDoc(id, { manifestLoading: true })
      const run = manifestQueueRef.current.then(() => getPsdManifest(presignedUrl))
      manifestQueueRef.current = run.catch(() => {}) // keep the queue moving even if this one fails
      const { document: manifestDocument, layers } = await run
      updateDoc(id, { psdDocument: manifestDocument, history: createHistory(layers), manifestLoading: false })
    } catch (e) {
      updateDoc(id, { manifestLoading: false, manifestError: e.message })
    }
  }

  function newDocEntry (id, fileName, size) {
    return {
      id,
      fileName,
      size: size ?? null,
      key: null,
      presignedUrl: null,
      uploading: false,
      uploadError: null,
      manifestLoading: false,
      manifestError: null,
      psdDocument: null,
      history: null,
      selectedId: null,
      zoom: 1,
      figmaFrameId: null,
      exporting: false,
      exportError: null,
      saving: false,
      saveError: null,
      downloadUrl: null,
      downloadPngUrl: null,
      downloaded: false,
      harmonizing: false,
      harmonizeError: null,
      harmonizedUrl: null
    }
  }

  // Step 3 of the UC4 flow, and the only way a PSD enters `documents` now — no
  // manual upload dropzone here anymore, PSDs only arrive as the workflow's own
  // output (already hosted, no local file/upload involved). The existing
  // resize/rotate/save editor below just works on them unchanged.
  function handleWorkflowPsds (psds) {
    for (const { url, name } of psds) {
      nextIdRef.current += 1
      const id = nextIdRef.current
      setDocuments((prev) => [...prev, { ...newDocEntry(id, name), presignedUrl: url }])
      setActiveId((prev) => prev ?? id)
      loadManifestFor(id, url)
    }
  }

  function handleRemoveDoc (id) {
    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== id)
      if (id === activeId) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  // Bounds/visibility edits and undo/redo all take an explicit docId (not just
  // "the active one") because every open document's LayerCanvas stays mounted
  // (hidden, not unmounted) rather than being torn down and rebuilt on switch —
  // see the canvas area below. That's what stops thumbnails re-loading/flashing
  // every time you click a different sidebar item.
  function handleLayerChange (docId, layerId, bounds) {
    const doc = documents.find((d) => d.id === docId)
    if (!doc) return
    const next = historyState(doc.history).map((l) => (l.id === layerId ? { ...l, bounds } : l))
    updateDoc(docId, (d) => ({ history: pushHistory(d.history, next), downloadUrl: null, downloadPngUrl: null, downloaded: false, harmonizedUrl: null, harmonizeError: null }))
  }

  function handleToggleVisible (docId, layerId) {
    const doc = documents.find((d) => d.id === docId)
    if (!doc) return
    const next = historyState(doc.history).map((l) => (l.id === layerId ? { ...l, visible: l.visible === false } : l))
    updateDoc(docId, (d) => ({ history: pushHistory(d.history, next), downloadUrl: null, downloadPngUrl: null, downloaded: false, harmonizedUrl: null, harmonizeError: null }))
  }

  function handleReorderLayers (docId, nextLayers) {
    updateDoc(docId, (d) => ({ history: pushHistory(d.history, nextLayers), downloadUrl: null, downloadPngUrl: null, downloaded: false, harmonizedUrl: null, harmonizeError: null }))
  }

  // Shared by the zoom in/out buttons and Ctrl+scroll (LayerCanvas's onZoomChange)
  // — same clamp/rounding either way, just a different delta per call site.
  function adjustZoom (docId, delta) {
    updateDoc(docId, (d) => ({ zoom: Math.min(3, Math.max(0.25, Math.round(((d.zoom ?? 1) + delta) * 100) / 100)) }))
  }

  function handleUndo () {
    if (activeDoc) updateDoc(activeDoc.id, (d) => ({ history: undoHistory(d.history), downloadUrl: null, downloadPngUrl: null, downloaded: false, harmonizedUrl: null, harmonizeError: null }))
  }

  function handleRedo () {
    if (activeDoc) updateDoc(activeDoc.id, (d) => ({ history: redoHistory(d.history), downloadUrl: null, downloadPngUrl: null, downloaded: false, harmonizedUrl: null, harmonizeError: null }))
  }

  // `type` (the manifest's layer type — smartObject, fillLayer, etc.) is needed
  // by psd-composite to satisfy the Photoshop v2 API's discriminated edit-layer
  // schema, which requires knowing what *kind* of layer this is in addition to
  // what operation to apply to it. `name` is included because these layer
  // `id`s came from a v1 manifest read, and v1/v2 are different pipelines under
  // the hood — psd-composite targets edits by name instead, since a v1-sourced
  // id may not resolve to anything in v2.
  // exportableLayers() drops group ("layerSection") and "background" layers —
  // see its own comment in services/figmaCanvasService.js for why neither can
  // carry an explicit transform.
  function buildEdits (layers, boundsOverridesById) {
    return exportableLayers(layers).map((l) => {
      const override = boundsOverridesById?.get(l.id)
      return {
        id: l.id,
        name: l.name,
        type: l.type,
        bounds: override ? override.bounds : l.bounds,
        visible: override ? override.visible : l.visible !== false
      }
    })
  }

  // Locally-uploaded docs have their own S3 key (refreshed since presigned
  // URLs expire); UC4 workflow-sourced docs don't — use their presignedUrl
  // as-is (see saveComposite in services/psdService.js).
  function sourceFor (doc) {
    return doc.key ? { key: doc.key } : { presignedUrl: doc.presignedUrl }
  }

  async function saveEdits (doc, edits) {
    const id = doc.id
    updateDoc(id, { saving: true, saveError: null })
    try {
      const { presignedUrl, pngPresignedUrl } = await saveComposite(sourceFor(doc), edits)
      updateDoc(id, { downloadUrl: presignedUrl, downloadPngUrl: pngPresignedUrl, downloaded: false, saving: false, harmonizedUrl: null, harmonizeError: null })
    } catch (e) {
      updateDoc(id, { saveError: e.message, saving: false })
    }
  }

  function handleSave () {
    if (!activeDoc) return
    saveEdits(activeDoc, buildEdits(historyState(activeDoc.history)))
  }

  // Any already-harmonized output was rendered off the *previous* composite —
  // clearing it here is what actually surfaces "try again" after further
  // edits: otherwise the old preview/download just sits there looking current.
  // Only enabled once a composite's been saved (needs its flattened PNG, not
  // the original per-layer source PSD — see harmonizeComposite in
  // services/psdService.js). The foreground mask the generative API needs is
  // derived server-side from these same layer edits/document size, not built
  // here (see psd-harmonize/index.js).
  async function handleHarmonize () {
    if (!activeDoc?.downloadPngUrl) return
    const id = activeDoc.id
    updateDoc(id, { harmonizing: true, harmonizeError: null })
    try {
      const edits = buildEdits(historyState(activeDoc.history))
      const documentSize = { width: activeDoc.psdDocument?.width, height: activeDoc.psdDocument?.height }
      const { harmonizedUrl } = await harmonizeComposite(activeDoc.downloadPngUrl, edits, documentSize)
      updateDoc(id, { harmonizedUrl, harmonizing: false })
    } catch (e) {
      updateDoc(id, { harmonizeError: e.message, harmonizing: false })
    }
  }

  // Figma-only: turns this doc's layers into real Figma nodes (see
  // figma-plugin/src/plugin/controller.js) so they can be dragged/resized/
  // rotated with Figma's own tools instead of the DOM-based LayerCanvas below.
  async function handleExportToCanvas () {
    if (!activeDoc) return
    const id = activeDoc.id
    updateDoc(id, { exporting: true, exportError: null })
    try {
      const frameId = await exportPsdToCanvas({
        fileName: activeDoc.fileName,
        document: activeDoc.psdDocument,
        layers: historyState(activeDoc.history)
      })
      updateDoc(id, { figmaFrameId: frameId, exporting: false })
    } catch (e) {
      updateDoc(id, { exporting: false, exportError: e.message })
    }
  }

  // Figma-only: reads the exported nodes' current position/size/rotation/
  // visibility back off the canvas, merges it with the layer metadata (name,
  // type) already on hand, and saves exactly like the non-Figma path does.
  async function handleSyncAndSave () {
    if (!activeDoc?.figmaFrameId) return
    const id = activeDoc.id
    updateDoc(id, { saving: true, saveError: null })
    try {
      const canvasEdits = await syncPsdFromCanvas(activeDoc.figmaFrameId)
      const overridesById = new Map(canvasEdits.map((e) => [e.id, e]))
      await saveEdits(activeDoc, buildEdits(historyState(activeDoc.history), overridesById))
    } catch (e) {
      updateDoc(id, { saveError: e.message, saving: false })
    }
  }

  function handleDownload (which) {
    const url = which === 'png' ? activeDoc?.downloadPngUrl : (which === 'jpeg' ? activeDoc?.harmonizedUrl : activeDoc?.downloadUrl)
    if (!url) return
    window.open(url, '_blank', 'noopener')
    updateDoc(activeDoc.id, { downloaded: true })
  }

  return (
    <div className="ulta-main">
      {/* Left column is just the PSD file list now — it grows as more files are
          uploaded, so LAYERS moved into the right/preview column (next to the
          canvas) instead of competing with it for the same shrinking sidebar. */}
      <div className="ulta-grid" style={{ gridTemplateColumns: documents.length > 0 ? '260px 1fr' : '1fr' }}>
        <div
          className="ulta-col"
          style={documents.length === 0 ? { maxWidth: uc4Running ? 860 : 420, margin: '0 auto', width: '100%', transition: 'max-width 0.3s ease' } : undefined}
        >
          <View UNSAFE_className="ulta-fade-in">
            <Heading level={3} margin={0}>SKU Personalization</Heading>
            <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)' }}>
              Run the UC4 batch below, then drag and resize the resulting PSDs' layers to build a composite.
            </Text>
          </View>

          <Uc4Workflow onOutputPsds={handleWorkflowPsds} onRunningChange={setUc4Running} />

          {documents.length > 0 && (
            <Flex direction="column" gap="size-75">
              <SectionHeading>PSD FILES ({documents.length})</SectionHeading>
              <PsdList documents={documents} activeId={activeId} onSelect={setActiveId} onRemove={handleRemoveDoc} />
            </Flex>
          )}
        </div>

        {documents.length > 0 && (
        <div className="ulta-col">
          <Flex direction="row" justifyContent="space-between" alignItems="center">
            <Flex alignItems="center" gap="size-200">
              <SectionHeading>PREVIEW</SectionHeading>
              {/* Zooms the whole canvas (not individual layers) — makes it much
                  easier to nudge things into alignment at 200%+ than eyeballing
                  it at the auto-fit size. Multiplies the same `scale` factor
                  everything else (drag/resize/snap/nudge) is computed in
                  (LayerCanvas.js), so interactions stay pixel-accurate at any
                  zoom level instead of a CSS transform faking the zoom visually. */}
              {hasDocument && !IS_FIGMA_PLUGIN && (
                <Flex alignItems="center" gap="size-50">
                  <ActionButton
                    isQuiet
                    onPress={() => adjustZoom(activeDoc.id, -0.25)}
                    aria-label="Zoom out"
                    UNSAFE_style={{ minWidth: 0, width: 22, height: 22 }}
                  >
                    <ZoomOut size="XS" />
                  </ActionButton>
                  <Text
                    UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)', minWidth: 34, textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => updateDoc(activeDoc.id, { zoom: 1 })}
                    title="Reset to 100%"
                  >
                    {Math.round((activeDoc.zoom ?? 1) * 100)}%
                  </Text>
                  <ActionButton
                    isQuiet
                    onPress={() => adjustZoom(activeDoc.id, 0.25)}
                    aria-label="Zoom in"
                    UNSAFE_style={{ minWidth: 0, width: 22, height: 22 }}
                  >
                    <ZoomIn size="XS" />
                  </ActionButton>
                </Flex>
              )}
            </Flex>
            {hasDocument && (
              <Flex gap="size-100" alignItems="center">
                {!IS_FIGMA_PLUGIN && (
                  <Flex gap="size-50">
                    <ActionButton isQuiet isDisabled={activeDoc.saving || !canUndoHistory(activeDoc.history)} onPress={handleUndo} aria-label="Undo">
                      <UndoIcon size="S" />
                    </ActionButton>
                    <ActionButton isQuiet isDisabled={activeDoc.saving || !canRedoHistory(activeDoc.history)} onPress={handleRedo} aria-label="Redo">
                      <RedoIcon size="S" />
                    </ActionButton>
                  </Flex>
                )}
                {/* Figma build: layers get edited as real nodes on Figma's own
                    canvas (see LayerCanvas replacement below), not here — this
                    button either sends them there, or (once exported) reads
                    their current position/size/rotation back and saves. */}
                <Button
                  variant="accent"
                  UNSAFE_style={{ backgroundColor: 'var(--ulta-accent)' }}
                  UNSAFE_className={`ulta-execute-btn${(activeDoc.saving || activeDoc.exporting) ? ' ulta-executing' : ''}`}
                  isDisabled={activeDoc.saving || activeDoc.exporting}
                  onPress={IS_FIGMA_PLUGIN ? (activeDoc.figmaFrameId ? handleSyncAndSave : handleExportToCanvas) : handleSave}
                >
                  <Flex gap="size-100" alignItems="center">
                    {(activeDoc.saving || activeDoc.exporting) && <span className="ulta-spinner" aria-hidden="true" />}
                    <Text>
                      {IS_FIGMA_PLUGIN
                        ? (activeDoc.figmaFrameId
                            ? (activeDoc.saving ? 'Syncing & saving...' : 'Sync from Canvas & Save')
                            : (activeDoc.exporting ? 'Exporting...' : 'Export to Figma Canvas'))
                        : (activeDoc.saving ? 'Saving...' : 'Save Composite')}
                    </Text>
                  </Flex>
                </Button>
                {IS_FIGMA_PLUGIN && activeDoc.figmaFrameId && (
                  <ActionButton isQuiet isDisabled={activeDoc.saving || activeDoc.exporting} onPress={handleExportToCanvas} aria-label="Re-export to Figma canvas">
                    <Text UNSAFE_style={{ fontSize: 12 }}>Re-export</Text>
                  </ActionButton>
                )}
                {/* Generative harmonization (Firefly Services /v2/harmonize-image)
                    against the saved composite's flattened PNG — only makes
                    sense once a composite exists. */}
                <Button
                  variant="secondary"
                  UNSAFE_className={activeDoc.harmonizing ? 'ulta-executing' : ''}
                  isDisabled={!activeDoc.downloadPngUrl || activeDoc.saving || activeDoc.exporting || activeDoc.harmonizing}
                  onPress={handleHarmonize}
                >
                  <Flex gap="size-100" alignItems="center">
                    {activeDoc.harmonizing && <span className="ulta-spinner" aria-hidden="true" />}
                    <Text>{activeDoc.harmonizing ? 'Harmonizing...' : 'Harmonize'}</Text>
                  </Flex>
                </Button>
                <DialogTrigger type="modal">
                  <ActionButton isQuiet isDisabled={!activeDoc.downloadPngUrl} aria-label="Preview PNG">
                    <Visibility size="S" />
                  </ActionButton>
                  {(close) => (
                    <Dialog size="L">
                      <Content>
                        <ActionButton isQuiet onPress={close} aria-label="Close" UNSAFE_style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                          <CloseIcon size="S" />
                        </ActionButton>
                        <Flex alignItems="center" justifyContent="center" UNSAFE_style={{ minHeight: 320 }}>
                          <img src={activeDoc.downloadPngUrl} alt="Composite PNG preview" className="ulta-lightbox-image" style={{ maxHeight: '70vh' }} />
                        </Flex>
                      </Content>
                      <Divider />
                      <ButtonGroup>
                        <Button variant="secondary" onPress={close}>Close</Button>
                      </ButtonGroup>
                    </Dialog>
                  )}
                </DialogTrigger>

                {activeDoc.harmonizedUrl && (
                  <DialogTrigger type="modal">
                    <ActionButton isQuiet aria-label="Preview harmonized image">
                      <Text UNSAFE_style={{ fontSize: 12 }}>Preview harmonized</Text>
                    </ActionButton>
                    {(close) => (
                      <Dialog size="L">
                        <Content>
                          <ActionButton isQuiet onPress={close} aria-label="Close" UNSAFE_style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                            <CloseIcon size="S" />
                          </ActionButton>
                          <Flex alignItems="center" justifyContent="center" UNSAFE_style={{ minHeight: 320 }}>
                            <img src={activeDoc.harmonizedUrl} alt="Harmonized composite preview" className="ulta-lightbox-image" style={{ maxHeight: '70vh' }} />
                          </Flex>
                        </Content>
                        <Divider />
                        <ButtonGroup>
                          <Button variant="secondary" onPress={close}>Close</Button>
                        </ButtonGroup>
                      </Dialog>
                    )}
                  </DialogTrigger>
                )}

                <MenuTrigger>
                  <Button variant="secondary" isDisabled={!activeDoc.downloadUrl}>
                    <Flex gap="size-100" alignItems="center">
                      <Text>{activeDoc.downloaded ? '✓ Downloaded' : 'Download'}</Text>
                      <ChevronDown size="XS" />
                    </Flex>
                  </Button>
                  <Menu
                    onAction={(key) => handleDownload(key)}
                    disabledKeys={[...(activeDoc.downloadPngUrl ? [] : ['png']), ...(activeDoc.harmonizedUrl ? [] : ['jpeg'])]}
                  >
                    <Item key="psd">Download PSD</Item>
                    <Item key="png">Download PNG</Item>
                    <Item key="jpeg">Download Harmonized JPEG</Item>
                  </Menu>
                </MenuTrigger>
              </Flex>
            )}
          </Flex>

          {activeDoc?.saveError && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{activeDoc.saveError}</Text>}
          {activeDoc?.exportError && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{activeDoc.exportError}</Text>}
          {activeDoc?.harmonizeError && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{activeDoc.harmonizeError}</Text>}

          <Flex direction="row" gap="size-200" flex={1} minHeight={0}>
            {(hasDocument || activeDoc?.manifestLoading) && (
              <Flex direction="column" gap="size-75" UNSAFE_style={{ width: 220, flexShrink: 0 }}>
                <Flex justifyContent="space-between" alignItems="center">
                  <SectionHeading>{hasDocument ? `LAYERS (${activeLayers.length})` : 'LAYERS'}</SectionHeading>
                  {hasDocument && (
                    <ActionButton
                      isQuiet
                      isSelected={showOnlyVisible}
                      onPress={() => setShowOnlyVisible((v) => !v)}
                      aria-label={showOnlyVisible ? 'Show all layers' : 'Show only visible layers'}
                      UNSAFE_style={{ minWidth: 0, width: 22, height: 22 }}
                    >
                      {showOnlyVisible ? <Visibility size="XS" /> : <VisibilityOff size="XS" />}
                    </ActionButton>
                  )}
                </Flex>
                {hasDocument && activeLayers.length > 6 && (
                  <SearchField
                    aria-label="Search layers"
                    placeholder="Search layers"
                    value={layerSearch}
                    onChange={setLayerSearch}
                    width="100%"
                  />
                )}
                <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-100" UNSAFE_style={{ overflow: 'auto' }}>
                  {hasDocument
                    ? (
                      <LayerList
                        layers={visibleLayers}
                        selectedId={activeDoc.selectedId}
                        onSelect={(layerId) => updateDoc(activeDoc.id, { selectedId: layerId })}
                        onToggleVisible={(layerId) => handleToggleVisible(activeDoc.id, layerId)}
                        onReorder={(nextLayers) => handleReorderLayers(activeDoc.id, nextLayers)}
                        reorderDisabled={!!layerSearch || showOnlyVisible}
                        // Once exported, layer state (position, visibility) lives
                        // on the Figma canvas — Figma's own layers panel handles
                        // visibility toggling from here, this list is browsing-only.
                        disabled={activeDoc.saving || !!activeDoc.figmaFrameId}
                      />
                      )
                    : (
                      <Flex direction="column" gap="size-150" UNSAFE_style={{ padding: '4px 2px' }}>
                        {[85, 65, 75, 55, 70, 60].map((width, i) => (
                          <div key={i} className="ulta-skeleton" style={{ height: 14, width: `${width}%`, borderRadius: 4 }} />
                        ))}
                      </Flex>
                      )}
                </View>
              </Flex>
            )}

            <View
              borderWidth="thin"
              borderColor="gray-300"
              borderRadius="medium"
              padding="size-200"
              flex={1}
              minHeight={0}
              UNSAFE_style={{ overflow: 'auto', position: 'relative' }}
            >
              {activeDoc?.manifestLoading && (
                <div className="ulta-skeleton" aria-label="Reading PSD layers" role="img" style={{ width: '100%', height: '100%', minHeight: 320, borderRadius: 8 }} />
              )}
              {activeDoc?.manifestError && (
                <Flex direction="column" alignItems="start" gap="size-100">
                  <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{activeDoc.manifestError}</Text>
                  <Button variant="secondary" onPress={() => loadManifestFor(activeDoc.id, activeDoc.presignedUrl)}>Retry</Button>
                </Flex>
              )}
              {!activeDoc && (
                <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)' }}>Upload a PSD to see its layers here.</Text>
              )}

              {/* Figma build: there's no DOM canvas to preserve across document
                  switches (see the non-Figma branch below for why that trick
                  exists) — editing happens on Figma's own canvas instead, this
                  is just a status readout for whichever document is active. */}
              {IS_FIGMA_PLUGIN && hasDocument && (
                <Flex direction="column" alignItems="center" justifyContent="center" gap="size-150" UNSAFE_style={{ height: '100%', textAlign: 'center', padding: '0 24px' }}>
                  {activeDoc.figmaFrameId
                    ? (
                      <>
                        <Text UNSAFE_style={{ fontSize: 13, fontWeight: 600 }}>Exported to the Figma canvas</Text>
                        <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-700)', maxWidth: 360 }}>
                          Drag, resize, and rotate the layers directly on the canvas using Figma's own tools.
                          Toggle a layer's visibility from Figma's own layers panel. When you're done, click
                          "Sync from Canvas &amp; Save" above to save your changes as a composite.
                        </Text>
                      </>
                      )
                    : (
                      <>
                        <Text UNSAFE_style={{ fontSize: 13, fontWeight: 600 }}>Not yet exported</Text>
                        <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-700)', maxWidth: 360 }}>
                          Click "Export to Figma Canvas" above to place this PSD's layers onto the canvas as
                          real, editable Figma nodes.
                        </Text>
                      </>
                      )}
                </Flex>
              )}

              {/* Non-Figma (plain web app): every loaded document's canvas stays
                  mounted, just hidden when not active — switching sidebar items
                  no longer re-fetches/re-decodes thumbnail images, it's just a
                  CSS toggle. Hidden via visibility (kept in layout, absolutely
                  positioned over the same spot), not display:none —
                  display:none elements don't reliably get their
                  background-image sizing/position computed by the browser, which
                  showed up as a layer rendering blank or misplaced until some
                  unrelated re-render forced a repaint. */}
              {!IS_FIGMA_PLUGIN && documents.filter((d) => d.psdDocument).map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    // "safe center" (not plain "center") — plain center + a
                    // scrollable ancestor is a known browser bug: once the
                    // zoomed canvas is bigger than this box, flex centering
                    // clips it symmetrically around the middle instead of
                    // letting you scroll to its actual edges ("should be
                    // scrollable to the end" / "background getting cropped").
                    // safe falls back to start-alignment once content
                    // overflows, so nothing becomes unreachable.
                    alignItems: 'safe center',
                    justifyContent: 'safe center',
                    visibility: doc.id === activeId ? 'visible' : 'hidden',
                    pointerEvents: doc.id === activeId ? 'auto' : 'none'
                  }}
                >
                  <LayerCanvas
                    psdDocument={doc.psdDocument}
                    layers={historyState(doc.history)}
                    selectedId={doc.selectedId}
                    onSelect={(layerId) => updateDoc(doc.id, { selectedId: layerId })}
                    onChange={(layerId, bounds) => handleLayerChange(doc.id, layerId, bounds)}
                    disabled={doc.saving}
                    canvasZoom={doc.zoom ?? 1}
                    onZoomChange={(deltaY) => adjustZoom(doc.id, -deltaY * 0.0015)}
                  />
                </div>
              ))}
            </View>
          </Flex>
        </div>
        )}
      </div>
    </div>
  )
}
