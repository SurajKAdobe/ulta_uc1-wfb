import { callAction } from '../api'
import { UC4_OUTPUT_PSD_NODE_IDS } from '../workflowConfig'

// Batch execute/status/cancel are the same run-workflow.adobe.io platform UC1
// uses (checkWorkflowStatus, isTerminalStatus, isFailedStatus in workflowService.js
// are workflow-agnostic — only batchId matters, reused as-is, no UC4 copy needed).
export async function runUc4Workflow (rows, backgroundImagePresignedUrl, templatePsdPresignedUrl) {
  return callAction('execute-uc4-workflow', { rows, backgroundImagePresignedUrl, templatePsdPresignedUrl })
}

// Display-only — mirrors execute-uc4-workflow's request shape but never sends
// it, and skips the per-SKU image re-hosting (see preview-uc4-workflow/index.js
// for why) so previewing is instant and free.
export async function previewUc4Workflow (rows, backgroundImagePresignedUrl, templatePsdPresignedUrl) {
  return callAction('preview-uc4-workflow', { rows, backgroundImagePresignedUrl, templatePsdPresignedUrl })
}

// Pulls every output PSD across every row execution — unlike UC1's single
// OUTPUT_PSD_NODE_ID, UC4_OUTPUT_PSD_NODE_IDS may list more than one output
// node once the real graph is known (see workflowConfig.js).
export function extractUc4OutputPsds (status) {
  const executions = status?.outputs || []
  const psds = []

  for (const execution of executions) {
    const nodeOutputs = execution?.outputs || []
    for (const nodeId of UC4_OUTPUT_PSD_NODE_IDS) {
      const node = nodeOutputs.find((n) => n.node_id === nodeId)
      const content = node?.content
      if (content?.presignedUrl) {
        psds.push({ url: content.presignedUrl, name: content.name || `${nodeId}.psd` })
      }
    }
  }

  return psds
}
