import { callAction } from '../api'
import { UC2B_OUTPUT_NODE_IDS } from '../workflowConfig'

// Batch execute/status/cancel are the same run-workflow.adobe.io platform UC1/
// UC4 use (checkWorkflowStatus, isTerminalStatus, isFailedStatus in
// workflowService.js are workflow-agnostic — only batchId matters, reused as-is).
export async function runUc2bWorkflow ({ csvPresignedUrl, templatePsdPresignedUrl }) {
  return callAction('execute-uc2b-workflow', { csvPresignedUrl, templatePsdPresignedUrl })
}

// Display-only — mirrors execute-uc2b-workflow's request shape but never sends it.
export async function previewUc2bWorkflow ({ csvPresignedUrl, templatePsdPresignedUrl }) {
  return callAction('preview-uc2b-workflow', { csvPresignedUrl, templatePsdPresignedUrl })
}

function isPsd (asset) {
  return asset.mimeType === 'image/vnd.adobe.photoshop' || asset.name?.toLowerCase().endsWith('.psd')
}

function isPng (asset) {
  return asset.mimeType === 'image/png' || asset.name?.toLowerCase().endsWith('.png')
}

// UC2B submits one Workflow Builder execution total (not one per CSV row like
// UC1/UC4 — the whole CSV is a single file input the graph parses internally,
// see actions/execute-uc2b-workflow/index.js), so status.outputs is expected
// to hold exactly one execution's worth of node results.
// UC2B_OUTPUT_NODE_IDS (workflowConfig.js) isn't known yet — until it is, this
// falls back to scanning every node the response actually produced (including
// the echoed CSV/template inputs, which are excluded naturally below since
// their content is plain text, not a file), so the feature stays usable — and
// the real output identifiable by process of elimination — in the meantime.
//
// A single node can report either one result directly on `content` or (a
// multi-variation merge step, confirmed from a real response) several nested
// under its own `outputs` array — normalized into one flat per-node asset
// list here, then paired into {name, psdUrl, pngUrl} the same way UC1's
// extractOutputAssets pairs a merged PSD with its PNG rendition, so
// BannerGeneration.js can preview the PNG and download the PSD per result.
export function extractUc2bOutputs (status) {
  const executions = status?.outputs || []
  const groups = []

  executions.forEach((execution) => {
    const nodeOutputs = execution?.outputs || []
    const scoped = UC2B_OUTPUT_NODE_IDS.length > 0
      ? nodeOutputs.filter((n) => UC2B_OUTPUT_NODE_IDS.includes(n.node_id))
      : nodeOutputs

    scoped.forEach((node) => {
      const assets = Array.isArray(node.outputs) && node.outputs.length > 0
        ? node.outputs.map((o) => ({ name: o.name, url: o.presignedUrl, mimeType: o.mimeType }))
        : (node.content?.presignedUrl ? [{ name: node.content.name, url: node.content.presignedUrl, mimeType: node.content.mimeType }] : [])

      const psd = assets.find(isPsd)
      const png = assets.find(isPng)
      if (!psd && !png) return

      groups.push({
        name: psd?.name || png?.name || node.node_id,
        psdUrl: psd?.url || null,
        pngUrl: png?.url || null
      })
    })
  })

  return groups
}
