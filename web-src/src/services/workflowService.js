import { callAction } from '../api'
import { OUTPUT_PSD_NODE_ID, OUTPUT_PNG_NODE_ID } from '../workflowConfig'

const TERMINAL_STATES = ['completed', 'succeeded', 'success', 'failed', 'error', 'cancelled', 'canceled']
const FAILED_STATES = ['failed', 'error', 'cancelled', 'canceled']

export async function executeWorkflow ({ rows, templatePresignedUrl, additionalTemplatePresignedUrls }) {
  return callAction('execute-workflow', { rows, templatePresignedUrl, additionalTemplatePresignedUrls })
}

// Same validation/payload construction as execute-workflow, but display-only — no
// request is actually sent to Workflow Builder and no secret headers are involved.
export async function previewWorkflowPayload ({ rows, templatePresignedUrl, additionalTemplatePresignedUrls }) {
  return callAction('preview-payload', { rows, templatePresignedUrl, additionalTemplatePresignedUrls })
}

export async function checkWorkflowStatus (batchId) {
  const { status } = await callAction('check-status', { batchId })
  return status
}

export async function checkWorkflowExecutions (batchId) {
  const { executions } = await callAction('check-executions', { batchId })
  return executions
}

export async function listBatches () {
  const { batches } = await callAction('list-batches', {})
  return batches
}

export async function cancelBatch (batchId) {
  const { result } = await callAction('cancel-batch', { batchId })
  return result
}

// Per-node failure reasons aren't in the /status summary, only in /executions —
// pull out the human-readable bits so a failed batch doesn't just show "failed".
export function summarizeExecutionFailures (executionsData) {
  const messages = []
  const executions = executionsData?.executions || []

  for (const exec of executions) {
    if (exec.status !== 'failed') continue
    const prefix = `Execution ${exec.assetIndex ?? exec.executionId ?? '?'}`
    if (exec.error) messages.push(`${prefix}: ${exec.error}`)

    for (const actionOut of (exec.outputs || [])) {
      if (actionOut.status !== 'failed') continue
      const detail = actionOut.error ||
        actionOut.metadata?.error ||
        actionOut.metadata?.errorMessage ||
        'no error detail provided'
      messages.push(`${prefix} → node "${actionOut.actionId || actionOut.actionType || '?'}": ${detail}`)
    }
  }

  return messages
}

// With ?format=preview, a completed status response includes an "outputs" array:
// one entry per batch execution (same order as the rows we submitted), each with
// its own "outputs" array of every node's result. We only care about the two
// final per-row assets (the merged PSD and its PNG rendition) — everything else
// in there is an echoed input (SKU/filename/background/template text, the 6
// static template passthroughs) that isn't useful to show the user.
export function extractOutputAssets (status) {
  const executions = status?.outputs || []
  return executions
    .map((execution, index) => {
      const nodeOutputs = execution?.outputs || []
      const findAsset = (nodeId) => {
        const node = nodeOutputs.find(n => n.node_id === nodeId)
        const content = node?.content
        if (!content?.presignedUrl) return null
        return { url: content.presignedUrl, name: content.name, mimeType: content.mimeType }
      }
      // Same destination folder is stamped on every write-files output for a
      // given execution — grab it off whichever one has it, not tied to a
      // specific node id (the write-files nodes' ids vary by workflow build).
      const acpFolderUrl = nodeOutputs.find(n => n.content?.metadata?.acpFolderUrl)?.content.metadata.acpFolderUrl || null
      return {
        index,
        psd: findAsset(OUTPUT_PSD_NODE_ID),
        png: findAsset(OUTPUT_PNG_NODE_ID),
        acpFolderUrl
      }
    })
    .filter(e => e.psd || e.png)
}

// ?format=preview responses use batch_summary (snake_case: total_input_sets,
// successful_sets, failed_sets, running_sets) plus a top-level 0-100 "progress".
// Older/plain status responses used assets.*/finalStatistics.* instead — kept as
// a fallback in case a non-preview call ever reaches this reader.
function readCount (status, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((obj, k) => obj?.[k], status)
    if (typeof value === 'number') return value
  }
  return null
}

export function getBatchSummary (status) {
  return {
    total: readCount(status, ['batch_summary.total_input_sets', 'assets.total', 'finalStatistics.total']),
    completed: readCount(status, ['batch_summary.successful_sets', 'assets.completed', 'finalStatistics.successful']),
    failed: readCount(status, ['batch_summary.failed_sets', 'assets.failed', 'finalStatistics.failed']),
    running: readCount(status, ['batch_summary.running_sets', 'assets.processing']),
    progress: readCount(status, ['progress'])
  }
}

// ponytail: the exact shape of the status response hasn't been documented, so this reads
// a handful of likely field names rather than assuming one. Tighten once confirmed.
function readState (status) {
  const raw = status?.status ?? status?.batchStatus ?? status?.state
  return raw ? String(raw).toLowerCase() : null
}

export function isTerminalStatus (status) {
  const state = readState(status)
  return state ? TERMINAL_STATES.includes(state) : false
}

export function isFailedStatus (status) {
  const state = readState(status)
  return state ? FAILED_STATES.includes(state) : false
}
