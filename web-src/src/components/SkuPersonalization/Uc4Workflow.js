import React, { useEffect, useRef, useState } from 'react'
import { Flex, Heading, Text, Button, View, ActionButton } from '@adobe/react-spectrum'
import ChevronUp from '@spectrum-icons/workflow/ChevronUp'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import Checkmark from '@spectrum-icons/workflow/Checkmark'
import CsvUpload from '../CsvUpload/CsvUpload'
import Uc4ImageUpload from './Uc4ImageUpload'
import Uc4PsdUpload from './Uc4PsdUpload'
import Uc4ColorPicker from './Uc4ColorPicker'
import Uc4CurlPreview from './Uc4CurlPreview'
import Uc4WorkflowStepper from './Uc4WorkflowStepper'
import { readUc4CsvPreview } from '../../services/csvService'
import { refreshPresignedUrl, uploadFile } from '../../services/uploadService'
import { runUc4Workflow, extractUc4OutputPsds } from '../../services/uc4WorkflowService'
import { checkWorkflowStatus, isTerminalStatus, isFailedStatus } from '../../services/workflowService'
import { generateFireflyBackground, getFireflyGenerationStatus } from '../../services/fireflyService'
import { readUc4Session, writeUc4Session } from '../../utils/uc4Storage'

const POLL_INTERVAL_MS = 4000

function SectionHeading ({ children }) {
  return (
    <Heading level={4} margin={0} UNSAFE_style={{ letterSpacing: 1, color: 'var(--spectrum-global-color-gray-700)', fontSize: 12 }}>
      {children}
    </Heading>
  )
}

// One pill per configured input, used in the collapsed-batch summary — a
// single run-on text string ("✓ a.csv · ✓ b.psd c.jpg · #FFFFFF") wrapped
// unpredictably mid-filename and dropped separators between wrapped lines.
// Individually-wrapping chips read cleanly no matter how many end up on a line.
function SummaryChip ({ label, swatch }) {
  return (
    <Flex
      alignItems="center"
      gap="size-50"
      UNSAFE_style={{
        fontSize: 11,
        color: 'var(--spectrum-global-color-gray-700)',
        background: 'var(--spectrum-global-color-gray-100)',
        border: '1px solid var(--spectrum-global-color-gray-300)',
        borderRadius: 999,
        padding: '3px 9px',
        maxWidth: 200
      }}
    >
      {swatch
        ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: swatch, border: '1px solid var(--spectrum-global-color-gray-400)', flexShrink: 0 }} />
        : <Checkmark size="XS" UNSAFE_style={{ color: 'var(--spectrum-global-color-green-700)', flexShrink: 0 }} />}
      <Text UNSAFE_style={{ fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
        {label}
      </Text>
    </Flex>
  )
}

// UC4 batch flow, step 1+2: drop the CSV and the background image, run the
// Workflow Builder batch, poll to completion. Step 3 (feeding the resulting
// PSDs into the resize/rotate editor) is the parent's job — see onOutputPsds.
//
// All 5 of the workflow's input nodes are wired server-side (see actions/
// execute-uc4-workflow/index.js): this uploaded template PSD, per-SKU product
// images (derived from Ulta's product image CDN), this uploaded background
// image (reused for every row — the CSV's own image-url column points at a
// protected asset our backend can't fetch), this picked color (white by
// default), and the CSV's own "Size" column. Batch submit/poll/extract is
// real and already wired to the same run-workflow.adobe.io platform UC1 uses.
export default function Uc4Workflow ({ onOutputPsds, onRunningChange }) {
  const [initialWorkflow] = useState(() => readUc4Session()?.workflow || null)
  const [csv, setCsv] = useState(() => {
    const savedCsv = initialWorkflow?.csv
    if (!savedCsv) return null
    const rows = savedCsv.rows || savedCsv.previewRows || []
    return { ...savedCsv, rows, previewRows: savedCsv.previewRows || rows }
  })
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvError, setCsvError] = useState(null)

  const [templatePsd, setTemplatePsd] = useState(() => initialWorkflow?.templatePsd || null) // { fileName, presignedUrl }
  const [psdUploading, setPsdUploading] = useState(false)
  const [psdError, setPsdError] = useState(null)

  const [backgroundImage, setBackgroundImage] = useState(() => initialWorkflow?.backgroundImage || null) // { fileName, presignedUrl, previewUrl }
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState(null)
  const [fireflyPrompt, setFireflyPrompt] = useState('five geometric shapes composed of cylindrical and rectangular forms arranged in staggered positions on a flat surface with soft gradients in the background')
  const [fireflyGenerating, setFireflyGenerating] = useState(false)
  const [fireflyGenerationStatus, setFireflyGenerationStatus] = useState('')
  const [fireflyGenerationError, setFireflyGenerationError] = useState(null)

  const [colorHex, setColorHex] = useState(() => initialWorkflow?.colorHex || '#FFFFFF')

  const [running, setRunning] = useState(() => !!initialWorkflow?.running && !!initialWorkflow?.batchId)
  const [runError, setRunError] = useState(() => initialWorkflow?.runError || null)
  const [batchId, setBatchId] = useState(() => initialWorkflow?.batchId || null)
  const [status, setStatus] = useState(() => initialWorkflow?.status || null)
  const [failed, setFailed] = useState(() => !!initialWorkflow?.failed)
  // Auto-collapses once a batch succeeds and the PSD editor takes over — the
  // upload details just add clutter at that point. Still manually reopenable
  // (e.g. to tweak inputs and run again).
  const [collapsed, setCollapsed] = useState(false)
  // Real timestamps for the stepper's live per-step timers — not estimates.
  const [timestamps, setTimestamps] = useState(() => initialWorkflow?.timestamps || { start: null, submitDone: null, processDone: null })

  const pollTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(pollTimerRef.current), [])
  useEffect(() => {
    if (running && batchId) pollStatus(batchId)
  }, []) // Resume polling after a page refresh.
  useEffect(() => {
    if (!csv && !templatePsd && !backgroundImage && !batchId) {
      writeUc4Session({ workflow: null })
      return
    }
    const persistedCsv = csv ? { ...csv, previewRows: undefined } : null
    const saved = writeUc4Session({
      workflow: {
        csv: persistedCsv,
        templatePsd,
        backgroundImage: backgroundImage && { ...backgroundImage, previewUrl: backgroundImage.presignedUrl },
        colorHex,
        running,
        batchId,
        failed,
        runError,
        timestamps
      }
    })
    if (!saved) setRunError('Could not save this workflow session in browser storage. Your inputs may not survive a refresh.')
  }, [csv, templatePsd, backgroundImage, colorHex, running, batchId, failed, runError, timestamps])
  // Mirrors showStepper below (widened while running or on failure; back to
  // normal once a batch succeeds and the PSD editor takes over).
  useEffect(() => { onRunningChange?.(running || failed) }, [running, failed]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCsvSelect (file, validationError) {
    if (validationError) {
      setCsvError(validationError)
      return
    }
    setCsvError(null)
    setCsvUploading(true)
    try {
      // UC4's CSV now has a header row — Image and SKU columns are required
      // (located by flexible alias match, see parseUc4Csv), everything else is
      // passed through as-is.
      const preview = await readUc4CsvPreview(file)
      if (preview.missingColumns.length > 0) {
        setCsvError(`CSV is missing required column(s): ${preview.missingColumns.join(', ')}`)
        return
      }
      setCsv({
        fileName: file.name,
        size: file.size,
        recordCount: preview.recordCount,
        headers: preview.headers,
        previewRows: preview.rows,
        rows: preview.rows,
        skuIndex: preview.skuIndex,
        nameIndex: preview.nameIndex,
        sizeIndex: preview.sizeIndex
      })
    } catch (e) {
      setCsvError(e.message)
    } finally {
      setCsvUploading(false)
    }
  }

  async function handlePsdSelect (file, validationError) {
    if (validationError) {
      setPsdError(validationError)
      return
    }
    setPsdError(null)
    setPsdUploading(true)
    try {
      const uploaded = await uploadFile(file, 'psd')
      setTemplatePsd({ fileName: file.name, presignedUrl: uploaded.presignedUrl, key: uploaded.key })
    } catch (e) {
      setPsdError(e.message)
    } finally {
      setPsdUploading(false)
    }
  }

  async function handleImageSelect (file, validationError) {
    if (validationError) {
      setImageError(validationError)
      return
    }
    setImageError(null)
    setImageUploading(true)
    try {
      const uploaded = await uploadFile(file, 'image')
      setBackgroundImage({ fileName: file.name, presignedUrl: uploaded.presignedUrl, previewUrl: URL.createObjectURL(file), key: uploaded.key })
    } catch (e) {
      setImageError(e.message)
    } finally {
      setImageUploading(false)
    }
  }

  async function handleGenerateBackground () {
    if (!fireflyPrompt.trim()) return
    setFireflyGenerating(true)
    setFireflyGenerationError(null)
    setFireflyGenerationStatus('Submitting prompt to the Ulta UC4 model…')
    try {
      const { jobId, statusUrl } = await generateFireflyBackground(fireflyPrompt)
      if (!jobId || !statusUrl) throw new Error('Firefly did not return a valid generation job.')
      const deadline = Date.now() + 4 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3500))
        const result = await getFireflyGenerationStatus({ jobId, statusUrl })
        const status = String(result.status || 'pending').toLowerCase()
        if (status === 'completed' && result.url) {
          setBackgroundImage({
            fileName: result.fileName || 'Firefly generated background.png',
            presignedUrl: result.url,
            previewUrl: result.url,
            key: result.key
          })
          setFireflyGenerationStatus('Background generated and saved to your assets.')
          return
        }
        if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
          throw new Error(result.message || `Firefly generation ${status}.`)
        }
        setFireflyGenerationStatus(result.message || `Generating background… ${status}`)
      }
      throw new Error('Background generation timed out. Please try again.')
    } catch (error) {
      setFireflyGenerationError(error.message)
      setFireflyGenerationStatus('')
    } finally {
      setFireflyGenerating(false)
    }
  }

  function pollStatus (id) {
    pollTimerRef.current = setTimeout(async () => {
      try {
        const latestStatus = await checkWorkflowStatus(id)
        setStatus(latestStatus)
        if (!isTerminalStatus(latestStatus)) {
          pollStatus(id)
          return
        }
        if (isFailedStatus(latestStatus)) {
          setRunError('The UC4 workflow batch finished with a failed status.')
          setFailed(true)
          setRunning(false)
          setTimestamps((t) => ({ ...t, processDone: Date.now() }))
          return
        }
        const psds = extractUc4OutputPsds(latestStatus, { rows: csv.rows, nameIndex: csv.nameIndex })
        if (psds.length === 0) {
          setRunError('The workflow completed, but no output PSDs were found — UC4_OUTPUT_PSD_NODE_IDS in workflowConfig.js may still need the real node id(s).')
          setFailed(true)
        } else {
          onOutputPsds(psds, { batchId: id })
          setCollapsed(true)
        }
        setRunning(false)
        setTimestamps((t) => ({ ...t, processDone: Date.now() }))
      } catch (e) {
        setRunError(e.message)
        setFailed(true)
        setRunning(false)
        setTimestamps((t) => ({ ...t, processDone: Date.now() }))
      }
    }, POLL_INTERVAL_MS)
  }

  async function handleRunWorkflow () {
    if (!csv || !backgroundImage || !templatePsd) return
    setRunning(true)
    setRunError(null)
    setBatchId(null)
    setStatus(null)
    setFailed(false)
    setTimestamps({ start: Date.now(), submitDone: null, processDone: null })
    try {
      const [backgroundImagePresignedUrl, templatePsdPresignedUrl] = await Promise.all([
        backgroundImage.key ? refreshPresignedUrl(backgroundImage.key) : backgroundImage.presignedUrl,
        templatePsd.key ? refreshPresignedUrl(templatePsd.key) : templatePsd.presignedUrl
      ])
      const result = await runUc4Workflow({
        rows: csv.rows,
        skuColumnIndex: csv.skuIndex,
        sizeColumnIndex: csv.sizeIndex,
        backgroundImagePresignedUrl,
        templatePsdPresignedUrl,
        colorHex
      })
      if (!result.batchId) {
        setRunning(false)
        return
      }
      setBatchId(result.batchId)
      setTimestamps((t) => ({ ...t, submitDone: Date.now() }))
      pollStatus(result.batchId)
    } catch (e) {
      setRunError(e.message)
      setRunning(false)
      setTimestamps((t) => ({ ...t, submitDone: Date.now(), processDone: Date.now() }))
    }
  }

  const canRun = !!csv && !!backgroundImage && !!templatePsd && !running
  // Hides itself again once a batch succeeds — the PSD editor takes over the
  // right side at that point (via onOutputPsds), so there's nothing left for
  // the stepper to show. Stays up on failure so the error is visible.
  const showStepper = running || failed

  const hasInputs = !!(csv || backgroundImage || templatePsd)

  const form = (
    <Flex direction="column" gap="size-75" UNSAFE_className="ulta-input-card">
      <Flex justifyContent="space-between" alignItems="center" UNSAFE_className="ulta-input-card-header">
        <Flex alignItems="center" gap="size-150">
          <span className="ulta-step-number">01</span>
          <Text UNSAFE_style={{ fontWeight: 700, fontSize: 17 }}>Campaign inputs</Text>
        </Flex>
        <Text UNSAFE_className="ulta-autosave">● Auto-saved</Text>
        <Flex gap="size-50" alignItems="center">
          <Uc4CurlPreview
            isReady={!!csv}
            rows={csv?.rows}
            skuColumnIndex={csv?.skuIndex}
            sizeColumnIndex={csv?.sizeIndex}
            backgroundImagePresignedUrl={backgroundImage?.presignedUrl}
            templatePsdPresignedUrl={templatePsd?.presignedUrl}
            colorHex={colorHex}
          />
          {hasInputs && (
            <ActionButton
              isQuiet
              onPress={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Show batch details' : 'Minimize batch details'}
              UNSAFE_style={{ minWidth: 0, width: 22, height: 22 }}
            >
              {collapsed ? <ChevronDown size="XS" /> : <ChevronUp size="XS" />}
            </ActionButton>
          )}
        </Flex>
      </Flex>

      {collapsed && (
        <Flex wrap gap="size-75" UNSAFE_style={{ maxWidth: '100%' }}>
          {csv && <SummaryChip label={csv.fileName} />}
          {templatePsd && <SummaryChip label={templatePsd.fileName} />}
          {backgroundImage && <SummaryChip label={backgroundImage.fileName} />}
          <SummaryChip label={colorHex} swatch={colorHex} />
        </Flex>
      )}

      {!collapsed && (
        <div className="ulta-input-card-body">
          <div className="ulta-form-field ulta-form-field-wide">
            <Flex justifyContent="space-between" alignItems="center">
              <Text UNSAFE_className="ulta-field-label">Product data</Text><Text UNSAFE_className="ulta-field-meta">CSV · Required</Text>
            </Flex>
            <CsvUpload value={csv} isUploading={csvUploading} error={csvError} disabled={running} onSelect={handleCsvSelect} onRemove={() => { setCsv(null); setCsvError(null) }} />
          </div>
          <div className="ulta-form-field ulta-form-field-half">
            <Flex justifyContent="space-between" alignItems="center">
              <Text UNSAFE_className="ulta-field-label">Design template</Text><Text UNSAFE_className="ulta-field-meta">PSD · Required</Text>
            </Flex>
            <Uc4PsdUpload value={templatePsd} isUploading={psdUploading} error={psdError} disabled={running} onSelect={handlePsdSelect} onRemove={() => { setTemplatePsd(null); setPsdError(null) }} />
          </div>
          <div className={`ulta-form-field ulta-form-field-half ulta-form-field-background${backgroundImage ? ' ulta-form-field-background-selected' : ''}`}>
            <Flex justifyContent="space-between" alignItems="center">
              <Text UNSAFE_className="ulta-field-label">Background image</Text><Text UNSAFE_className="ulta-field-meta">Optional</Text>
            </Flex>
            <Uc4ImageUpload
              value={backgroundImage}
              isUploading={imageUploading}
              error={imageError}
              disabled={running}
              onSelect={handleImageSelect}
              onRemove={() => { setBackgroundImage(null); setImageError(null) }}
              prompt={fireflyPrompt}
              onPromptChange={setFireflyPrompt}
              isGenerating={fireflyGenerating}
              generationStatus={fireflyGenerationStatus}
              generationError={fireflyGenerationError}
              onGenerate={handleGenerateBackground}
            />
          </div>
          <div className="ulta-form-field ulta-form-field-half">
            <Flex justifyContent="space-between" alignItems="center">
              <Text UNSAFE_className="ulta-field-label">Canvas color</Text><Text UNSAFE_className="ulta-field-meta">Fallback</Text>
            </Flex>
            <Uc4ColorPicker value={colorHex} onChange={setColorHex} disabled={running} />
          </div>
          <Flex direction="column" gap="size-50" UNSAFE_className="ulta-form-actions">
              <Button
                variant="accent"
                UNSAFE_style={{ backgroundColor: 'var(--ulta-accent)' }}
                UNSAFE_className={`ulta-execute-btn${running ? ' ulta-executing' : ''}`}
                isDisabled={!canRun}
                onPress={handleRunWorkflow}
              >
                <Flex gap="size-100" alignItems="center">
                  {running && <span className="ulta-spinner" aria-hidden="true" />}
                  <Text>{running ? 'Running workflow...' : 'Run Workflow'}</Text>
                </Flex>
              </Button>
              {runError && !showStepper && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{runError}</Text>}
          </Flex>
        </div>
      )}
    </Flex>
  )

  if (!showStepper) return form

  // While a batch is in flight (or just failed), the form moves to the left
  // and an animated stepper takes the right — once it succeeds, onOutputPsds
  // hands off to the parent's PSD editor and this whole component shrinks
  // back to the form-only view above.
  return (
    <Flex direction="row" gap="size-300" alignItems="start" UNSAFE_className="ulta-running-layout">
      <View flex={1} minWidth={0} UNSAFE_className="ulta-running-form">{form}</View>
      <View flex={1} minWidth={0} UNSAFE_className="ulta-running-status">
        <Uc4WorkflowStepper status={status} running={running} failed={failed} errorMessage={runError} timestamps={timestamps} totalRows={csv?.rows?.length} />
      </View>
    </Flex>
  )
}
