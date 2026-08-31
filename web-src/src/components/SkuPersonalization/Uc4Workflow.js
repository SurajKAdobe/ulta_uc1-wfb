import React, { useEffect, useRef, useState } from 'react'
import { Flex, Heading, Text, Button, View, ActionButton } from '@adobe/react-spectrum'
import ChevronUp from '@spectrum-icons/workflow/ChevronUp'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import Checkmark from '@spectrum-icons/workflow/Checkmark'
import Uc4CsvUpload from './Uc4CsvUpload'
import Uc4ImageUpload from './Uc4ImageUpload'
import Uc4PsdUpload from './Uc4PsdUpload'
import Uc4ColorPicker from './Uc4ColorPicker'
import Uc4CurlPreview from './Uc4CurlPreview'
import Uc4WorkflowStepper from './Uc4WorkflowStepper'
import { readUc4CsvPreview } from '../../services/csvService'
import { uploadFile } from '../../services/uploadService'
import { runUc4Workflow, extractUc4OutputPsds } from '../../services/uc4WorkflowService'
import { checkWorkflowStatus, isTerminalStatus, isFailedStatus } from '../../services/workflowService'

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
// All 4 of the workflow's input nodes are wired server-side (see actions/
// execute-uc4-workflow/index.js): this uploaded template PSD, per-SKU product
// images (derived from Ulta's product image CDN), this uploaded background
// image (reused for every row — the CSV's own image-url column points at a
// protected asset our backend can't fetch), and this picked color (white by
// default). Batch submit/poll/extract is real and already wired to the same
// run-workflow.adobe.io platform UC1 uses.
export default function Uc4Workflow ({ onOutputPsds, onRunningChange }) {
  const [csv, setCsv] = useState(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvError, setCsvError] = useState(null)

  const [templatePsd, setTemplatePsd] = useState(null) // { fileName, presignedUrl }
  const [psdUploading, setPsdUploading] = useState(false)
  const [psdError, setPsdError] = useState(null)

  const [backgroundImage, setBackgroundImage] = useState(null) // { fileName, presignedUrl, previewUrl }
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState(null)

  const [colorHex, setColorHex] = useState('#FFFFFF')

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [status, setStatus] = useState(null)
  const [failed, setFailed] = useState(false)
  // Auto-collapses once a batch succeeds and the PSD editor takes over — the
  // upload details just add clutter at that point. Still manually reopenable
  // (e.g. to tweak inputs and run again).
  const [collapsed, setCollapsed] = useState(false)
  // Real timestamps for the stepper's live per-step timers — not estimates.
  const [timestamps, setTimestamps] = useState({ start: null, submitDone: null, processDone: null })

  const pollTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(pollTimerRef.current), [])
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
        nameIndex: preview.nameIndex
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
      setTemplatePsd({ fileName: file.name, presignedUrl: uploaded.presignedUrl })
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
      setBackgroundImage({ fileName: file.name, presignedUrl: uploaded.presignedUrl, previewUrl: URL.createObjectURL(file) })
    } catch (e) {
      setImageError(e.message)
    } finally {
      setImageUploading(false)
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
          onOutputPsds(psds)
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
      const result = await runUc4Workflow({
        rows: csv.rows,
        skuColumnIndex: csv.skuIndex,
        backgroundImagePresignedUrl: backgroundImage.presignedUrl,
        templatePsdPresignedUrl: templatePsd.presignedUrl,
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
    <Flex direction="column" gap="size-75">
      <Flex justifyContent="space-between" alignItems="center">
        <SectionHeading>UC4 BATCH (CSV)</SectionHeading>
        <Flex gap="size-50" alignItems="center">
          <Uc4CurlPreview
            isReady={!!csv}
            rows={csv?.rows}
            skuColumnIndex={csv?.skuIndex}
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
        <>
          <Uc4CsvUpload
            value={csv}
            isUploading={csvUploading}
            error={csvError}
            disabled={running}
            onSelect={handleCsvSelect}
            onRemove={() => { setCsv(null); setCsvError(null) }}
          />

          <SectionHeading>TEMPLATE PSD</SectionHeading>
          <Uc4PsdUpload
            value={templatePsd}
            isUploading={psdUploading}
            error={psdError}
            disabled={running}
            onSelect={handlePsdSelect}
            onRemove={() => { setTemplatePsd(null); setPsdError(null) }}
          />

          <SectionHeading>BACKGROUND IMAGE</SectionHeading>
          <Uc4ImageUpload
            value={backgroundImage}
            isUploading={imageUploading}
            error={imageError}
            disabled={running}
            onSelect={handleImageSelect}
            onRemove={() => { setBackgroundImage(null); setImageError(null) }}
          />

          <SectionHeading>BACKGROUND COLOR</SectionHeading>
          <Uc4ColorPicker value={colorHex} onChange={setColorHex} disabled={running} />

          {hasInputs && (
            <Flex direction="column" gap="size-50">
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
          )}
        </>
      )}
    </Flex>
  )

  if (!showStepper) return form

  // While a batch is in flight (or just failed), the form moves to the left
  // and an animated stepper takes the right — once it succeeds, onOutputPsds
  // hands off to the parent's PSD editor and this whole component shrinks
  // back to the form-only view above.
  return (
    <Flex direction="row" gap="size-300" alignItems="start">
      <View flex={1} minWidth={0}>{form}</View>
      <View flex={1} minWidth={0}>
        <Uc4WorkflowStepper batchId={batchId} status={status} running={running} failed={failed} errorMessage={runError} timestamps={timestamps} totalRows={csv?.rows?.length} />
      </View>
    </Flex>
  )
}
