import React, { useEffect, useRef, useState } from 'react'
import { Flex, Heading, Text, Button } from '@adobe/react-spectrum'
import Uc4CsvUpload from './Uc4CsvUpload'
import Uc4ImageUpload from './Uc4ImageUpload'
import Uc4PsdUpload from './Uc4PsdUpload'
import Uc4CurlPreview from './Uc4CurlPreview'
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

// UC4 batch flow, step 1+2: drop the CSV and the background image, run the
// Workflow Builder batch, poll to completion. Step 3 (feeding the resulting
// PSDs into the resize/rotate editor) is the parent's job — see onOutputPsds.
//
// All 4 of the workflow's input nodes are wired server-side (see actions/
// execute-uc4-workflow/index.js): this uploaded template PSD, per-SKU product
// images (derived from Ulta's product image CDN), this uploaded background
// image (reused for every row — the CSV's own image-url column points at a
// protected asset our backend can't fetch), and a hardcoded white color. Batch
// submit/poll/extract is real and already wired to the same run-workflow.adobe.io
// platform UC1 uses.
export default function Uc4Workflow ({ onOutputPsds }) {
  const [csv, setCsv] = useState(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvError, setCsvError] = useState(null)

  const [templatePsd, setTemplatePsd] = useState(null) // { fileName, presignedUrl }
  const [psdUploading, setPsdUploading] = useState(false)
  const [psdError, setPsdError] = useState(null)

  const [backgroundImage, setBackgroundImage] = useState(null) // { fileName, presignedUrl, previewUrl }
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState(null)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [batchId, setBatchId] = useState(null)

  const pollTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(pollTimerRef.current), [])

  async function handleCsvSelect (file, validationError) {
    if (validationError) {
      setCsvError(validationError)
      return
    }
    setCsvError(null)
    setCsvUploading(true)
    try {
      // UC4's CSV has no header row — every row is data, and columns are passed
      // through positionally as-is (see readUc4CsvPreview / parseUc4Csv).
      const preview = await readUc4CsvPreview(file)
      setCsv({
        fileName: file.name,
        size: file.size,
        recordCount: preview.recordCount,
        headers: preview.headers,
        previewRows: preview.rows,
        rows: preview.rows
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
        const status = await checkWorkflowStatus(id)
        if (!isTerminalStatus(status)) {
          pollStatus(id)
          return
        }
        if (isFailedStatus(status)) {
          setRunError('The UC4 workflow batch finished with a failed status.')
          setRunning(false)
          return
        }
        const psds = extractUc4OutputPsds(status)
        if (psds.length === 0) {
          setRunError('The workflow completed, but no output PSDs were found — UC4_OUTPUT_PSD_NODE_IDS in workflowConfig.js may still need the real node id(s).')
        } else {
          onOutputPsds(psds)
        }
        setRunning(false)
      } catch (e) {
        setRunError(e.message)
        setRunning(false)
      }
    }, POLL_INTERVAL_MS)
  }

  async function handleRunWorkflow () {
    if (!csv || !backgroundImage || !templatePsd) return
    setRunning(true)
    setRunError(null)
    setBatchId(null)
    try {
      const result = await runUc4Workflow(csv.rows, backgroundImage.presignedUrl, templatePsd.presignedUrl)
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

  const canRun = !!csv && !!backgroundImage && !!templatePsd && !running

  return (
    <Flex direction="column" gap="size-75">
      <Flex justifyContent="space-between" alignItems="center">
        <SectionHeading>UC4 BATCH (CSV)</SectionHeading>
        <Uc4CurlPreview
          isReady={!!csv}
          rows={csv?.rows}
          backgroundImagePresignedUrl={backgroundImage?.presignedUrl}
          templatePsdPresignedUrl={templatePsd?.presignedUrl}
        />
      </Flex>
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

      {(csv || backgroundImage || templatePsd) && (
        <Flex direction="column" gap="size-50">
          <Button variant="accent" UNSAFE_style={{ backgroundColor: 'var(--ulta-accent)' }} isDisabled={!canRun} onPress={handleRunWorkflow}>
            <Flex gap="size-100" alignItems="center">
              {running && <span className="ulta-spinner" aria-hidden="true" />}
              <Text>{running ? 'Running workflow...' : 'Run Workflow'}</Text>
            </Flex>
          </Button>
          {runError && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{runError}</Text>}
          {batchId && <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>Batch: {batchId}</Text>}
        </Flex>
      )}
    </Flex>
  )
}
