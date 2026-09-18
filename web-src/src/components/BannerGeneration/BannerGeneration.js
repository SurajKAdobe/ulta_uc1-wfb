import React, { useEffect, useRef, useState } from 'react'
import { View, Flex, Heading, Text, Button, ActionButton, DialogTrigger, Dialog, Content, Divider, ButtonGroup } from '@adobe/react-spectrum'
import Download from '@spectrum-icons/workflow/Download'
import Visibility from '@spectrum-icons/workflow/Visibility'
import CloseIcon from '@spectrum-icons/workflow/Close'
import CsvUpload from '../CsvUpload/CsvUpload'
import Uc2bPsdUpload from './Uc2bPsdUpload'
import { uploadFile } from '../../services/uploadService'
import { runUc2bWorkflow, extractUc2bOutputs } from '../../services/uc2bWorkflowService'
import { checkWorkflowStatus, isTerminalStatus, isFailedStatus } from '../../services/workflowService'
import { readCsvPreview } from '../../services/csvService'

const POLL_INTERVAL_MS = 4000

// Same formatting as ExecutionStatus.js's formatDuration.
function formatDuration (ms) {
  if (ms == null || !Number.isFinite(ms)) return null
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function SectionHeading ({ children }) {
  return (
    <Heading level={4} margin={0} UNSAFE_style={{ letterSpacing: 1, color: 'var(--spectrum-global-color-gray-700)', fontSize: 12 }}>
      {children}
    </Heading>
  )
}

// UC2B: banner generation from a CSV + a PSD template. Unlike UC1/UC4 (one
// Workflow Builder execution per CSV row), this graph takes the whole CSV file
// as a single input and generates its banner(s) internally — one execution
// total (see actions/execute-uc2b-workflow/index.js), so there's no per-row
// CSV parsing/preview here, just two file uploads and a run/poll loop.
export default function BannerGeneration () {
  const [csv, setCsv] = useState(null) // { fileName, presignedUrl }
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvError, setCsvError] = useState(null)

  const [templatePsd, setTemplatePsd] = useState(null) // { fileName, presignedUrl }
  const [psdUploading, setPsdUploading] = useState(false)
  const [psdError, setPsdError] = useState(null)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [failed, setFailed] = useState(false)
  const [outputs, setOutputs] = useState([])
  const [elapsedMs, setElapsedMs] = useState(null)

  const pollTimerRef = useRef(null)
  const runStartRef = useRef(null)
  useEffect(() => () => clearTimeout(pollTimerRef.current), [])

  // UC2B has no per-row progress to report (one execution total, see comment
  // above), so the ticking elapsed timer is the loader — same fallback UC1's
  // ExecutionStatus uses when getBatchSummary can't produce a percent.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setElapsedMs(Date.now() - runStartRef.current), 1000)
    return () => clearInterval(timer)
  }, [running])

  async function handleCsvSelect (file, validationError) {
    if (validationError) {
      setCsvError(validationError)
      return
    }
    setCsvError(null)
    setCsvUploading(true)
    try {
      // UC2B has no fixed/known CSV schema (the graph parses the whole file
      // itself), so this is display-only — no required-column validation like
      // UC1/UC4's readCsvRows/readUc4CsvPreview.
      const [uploaded, preview] = await Promise.all([uploadFile(file, 'csv'), readCsvPreview(file)])
      setCsv({
        fileName: file.name,
        presignedUrl: uploaded.presignedUrl,
        size: file.size,
        recordCount: preview.recordCount,
        headers: preview.headers,
        previewRows: preview.rows
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

  function pollStatus (id) {
    pollTimerRef.current = setTimeout(async () => {
      try {
        const latestStatus = await checkWorkflowStatus(id)
        if (!isTerminalStatus(latestStatus)) {
          pollStatus(id)
          return
        }
        if (isFailedStatus(latestStatus)) {
          setRunError('The UC2B workflow finished with a failed status.')
          setFailed(true)
          setRunning(false)
          return
        }
        setOutputs(extractUc2bOutputs(latestStatus))
        setRunning(false)
      } catch (e) {
        setRunError(e.message)
        setFailed(true)
        setRunning(false)
      }
    }, POLL_INTERVAL_MS)
  }

  async function handleRunWorkflow () {
    if (!csv || !templatePsd) return
    setRunning(true)
    setRunError(null)
    setBatchId(null)
    setFailed(false)
    setOutputs([])
    runStartRef.current = Date.now()
    setElapsedMs(0)
    try {
      const result = await runUc2bWorkflow({ csvPresignedUrl: csv.presignedUrl, templatePsdPresignedUrl: templatePsd.presignedUrl })
      if (!result.batchId) {
        setRunning(false)
        return
      }
      setBatchId(result.batchId)
      pollStatus(result.batchId)
    } catch (e) {
      setRunError(e.message)
      setRunning(false)
    }
  }

  const canRun = !!csv && !!templatePsd && !running

  return (
    <div className="ulta-main">
      <div className="ulta-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="ulta-col" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <View UNSAFE_className="ulta-fade-in">
            <Heading level={3} margin={0}>Banner Generation</Heading>
            <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)' }}>
              Upload a CSV and a banner PSD template — Workflow Builder generates the banner from both in one run.
            </Text>
          </View>

          <SectionHeading>CSV</SectionHeading>
          <CsvUpload
            value={csv}
            isUploading={csvUploading}
            error={csvError}
            disabled={running}
            onSelect={handleCsvSelect}
            onRemove={() => { setCsv(null); setCsvError(null) }}
          />

          <SectionHeading>BANNER TEMPLATE PSD</SectionHeading>
          <Uc2bPsdUpload
            value={templatePsd}
            isUploading={psdUploading}
            error={psdError}
            disabled={running}
            onSelect={handlePsdSelect}
            onRemove={() => { setTemplatePsd(null); setPsdError(null) }}
          />

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
                <Text>{running ? 'Generating banner...' : 'Generate Banner'}</Text>
              </Flex>
            </Button>
            {running && (
              <Flex direction="column" gap="size-50">
                <div className="ulta-progress-track ulta-progress-indeterminate" aria-hidden="true" />
                <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
                  Elapsed: {formatDuration(elapsedMs)}
                </Text>
              </Flex>
            )}
            {runError && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{runError}</Text>}
            {failed && batchId && (
              <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>Batch ID: {batchId}</Text>
            )}
          </Flex>

          {outputs.length > 0 && (
            <Flex direction="column" gap="size-75">
              <SectionHeading>{outputs.length > 1 ? 'RESULTS' : 'RESULT'}</SectionHeading>
              {/* UC2B_OUTPUT_NODE_IDS (workflowConfig.js) isn't known yet, so this
                  may show every psd/png-shaped asset the response produced
                  (including the echoed template input) rather than just the
                  banner — see extractUc2bOutputs in
                  services/uc2bWorkflowService.js. Same preview-then-download
                  pattern as SkuPersonalization.js's composite preview. */}
              {outputs.map((asset, i) => (
                <Flex
                  key={i}
                  alignItems="center"
                  justifyContent="space-between"
                  gap="size-100"
                  UNSAFE_style={{ border: '1px solid var(--spectrum-global-color-gray-300)', borderRadius: 6, padding: '8px 12px' }}
                >
                  <Text UNSAFE_style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.name}>
                    {asset.name}
                  </Text>
                  <Flex gap="size-50">
                    <DialogTrigger type="modal">
                      <ActionButton isQuiet isDisabled={!asset.pngUrl} aria-label={`Preview ${asset.name}`}>
                        <Visibility size="S" />
                      </ActionButton>
                      {(close) => (
                        <Dialog size="L">
                          <Content>
                            <ActionButton isQuiet onPress={close} aria-label="Close" UNSAFE_style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                              <CloseIcon size="S" />
                            </ActionButton>
                            <Flex alignItems="center" justifyContent="center" UNSAFE_style={{ minHeight: 320 }}>
                              <img src={asset.pngUrl} alt={`${asset.name} preview`} className="ulta-lightbox-image" style={{ maxHeight: '70vh' }} />
                            </Flex>
                          </Content>
                          <Divider />
                          <ButtonGroup>
                            <Button variant="secondary" onPress={close}>Close</Button>
                          </ButtonGroup>
                        </Dialog>
                      )}
                    </DialogTrigger>
                    <ActionButton
                      isQuiet
                      isDisabled={!asset.psdUrl}
                      onPress={() => window.open(asset.psdUrl, '_blank', 'noopener')}
                      aria-label={`Download ${asset.name} PSD`}
                    >
                      <Download size="S" />
                    </ActionButton>
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </div>
      </div>
    </div>
  )
}
