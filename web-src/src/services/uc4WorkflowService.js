import { callAction } from '../api'
import { UC4_OUTPUT_PSD_NODE_IDS } from '../workflowConfig'

// Batch execute/status/cancel are the same run-workflow.adobe.io platform UC1
// uses (checkWorkflowStatus, isTerminalStatus, isFailedStatus in workflowService.js
// are workflow-agnostic — only batchId matters, reused as-is, no UC4 copy needed).
// ponytail: switched to an options object once a 4th same-typed (string) param
// (colorHex) would've made positional args ambiguous to read at the call site.
export async function runUc4Workflow ({ rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex }) {
  return callAction('execute-uc4-workflow', { rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex })
}

// Display-only — mirrors execute-uc4-workflow's request shape but never sends
// it, and skips the per-SKU image re-hosting (see preview-uc4-workflow/index.js
// for why) so previewing is instant and free.
export async function previewUc4Workflow ({ rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex }) {
  return callAction('preview-uc4-workflow', { rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex })
}

// Pulls every output PSD across every row execution — unlike UC1's single
// OUTPUT_PSD_NODE_ID, UC4_OUTPUT_PSD_NODE_IDS may list more than one output
// node once the real graph is known (see workflowConfig.js).
// `rows`/`nameIndex` (the CSV's Name column, see parseUc4Csv) are optional —
// when given, each output PSD is labeled with its row's name instead of the
// output node's own generic filename (e.g. "result.psd" for every row).
export function extractUc4OutputPsds (status, { rows, nameIndex } = {}) {
  const executions = status?.outputs || []
  const psds = []

  executions.forEach((execution, rowIndex) => {
    const nodeOutputs = execution?.outputs || []
    const rowLabel = nameIndex != null && nameIndex >= 0 ? rows?.[rowIndex]?.[nameIndex] : null
    UC4_OUTPUT_PSD_NODE_IDS.forEach((nodeId, nodeIndex) => {
      const node = nodeOutputs.find((n) => n.node_id === nodeId)
      const content = node?.content
      if (!content?.presignedUrl) return
      const suffix = UC4_OUTPUT_PSD_NODE_IDS.length > 1 ? ` (${nodeIndex + 1})` : ''
      const name = rowLabel ? `${rowLabel}${suffix}` : (content.name || `${nodeId}.psd`)
      psds.push({ url: content.presignedUrl, name })
    })
  })

  return psds
}

// Per-row progress derived from the same per-execution node-status data
// extractUc4OutputPsds already reads (status.outputs[i].outputs[j].status —
// confirmed real from an actual failed-batch response, not guessed) rather
// than batch_summary.* counts, which getBatchSummary (workflowService.js)
// falls back to an indeterminate spinner for when they're absent — that's
// what showed up as one opaque spinner instead of real "X of Y done" numbers.
// A row counts as done once its PSD output node(s) all report 'completed',
// failed if any node in that row reports 'failed', otherwise still running.
export function getUc4RowProgress (status, totalRows) {
  const executions = status?.outputs || []
  let done = 0
  let failed = 0

  for (const execution of executions) {
    const nodeOutputs = execution?.outputs || []
    if (nodeOutputs.some((n) => n.status === 'failed')) {
      failed++
      continue
    }
    if (UC4_OUTPUT_PSD_NODE_IDS.length > 0 && UC4_OUTPUT_PSD_NODE_IDS.every((id) => nodeOutputs.find((n) => n.node_id === id)?.status === 'completed')) {
      done++
    }
  }

  return { done, failed, total: totalRows ?? executions.length }
}
