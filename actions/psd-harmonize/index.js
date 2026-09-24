const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { buildWorkflowHeaders } = require('../libs/workflowAuth')

const WORKFLOW_API_URL = 'https://run-workflow.adobe.io/batch/execute'
const STATUS_URL = (batchId) => `https://run-workflow.adobe.io/batch/${batchId}/status?format=preview`
const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 250000
const WORKFLOW_ID = '69997ca7-12e1-443e-b432-5833a49bfb04'
const INPUT_NODE_ID = 'node-1790252644103-va7fak2d1'

function validate ({ presignedUrl, psdPresignedUrl }, params) {
  if (!presignedUrl) return 'presignedUrl is required'
  if (!psdPresignedUrl) return 'psdPresignedUrl is required'
  if (!params.API_KEY || !params.IMS_USER_ID || !params.IMS_OAUTH_S2S_ORG_ID) {
    return 'Workflow Builder credentials are not fully configured'
  }
  return null
}

function findOutputAssets (status, inputUrls) {
  const outputs = status?.outputs || []
  const assets = []
  for (const execution of outputs) {
    for (const node of execution?.outputs || []) {
      for (const asset of (node.outputs || [])) {
        if (asset?.presignedUrl) assets.push(asset)
      }
      if (node.content?.presignedUrl) assets.push(node.content)
    }
  }
  return assets.filter((asset) => !inputUrls.includes(asset.presignedUrl))
}

function selectPreviewAsset (assets) {
  return assets.find((asset) =>
    asset.mimeType === 'image/png' || asset.name?.toLowerCase().endsWith('.png')
  ) || assets.find((asset) =>
    asset.mimeType?.startsWith('image/')
  ) || assets[0]
}

function selectPsdAsset (assets) {
  return assets.find((asset) =>
    asset.mimeType === 'image/vnd.adobe.photoshop' || asset.name?.toLowerCase().endsWith('.psd')
  )
}

function safeUrl (url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

function summarizeStatus (data) {
  return {
    status: data?.status?.status || data?.status || data?.batchStatus || null,
    outputs: Array.isArray(data?.outputs) ? data.outputs.length : 0,
    executionSummaries: (data?.outputs || []).map((execution) => ({
      status: execution?.status || execution?.executionStatus || null,
      nodes: Array.isArray(execution?.outputs) ? execution.outputs.map((node) => ({
        nodeId: node?.node_id || null,
        status: node?.status || null,
        outputCount: Array.isArray(node?.outputs) ? node.outputs.length : 0,
        hasContentUrl: Boolean(node?.content?.presignedUrl)
      })) : []
    }))
  }
}

async function waitForWorkflow (batchId, params, logger) {
  const deadline = Date.now() + MAX_WAIT_MS
  let pollNumber = 0
  for (;;) {
    pollNumber += 1
    const response = await fetch(STATUS_URL(batchId), {
      headers: await buildWorkflowHeaders(params)
    })
    const data = await response.json().catch(() => null)
    const summary = summarizeStatus(data)
    logger.info(`Harmonization poll ${pollNumber}: HTTP ${response.status} ${JSON.stringify(summary)}`)
    if (!response.ok) throw new Error(`Workflow status returned ${response.status}: ${JSON.stringify(data)}`)

    const status = String(
      typeof data?.status === 'string' ? data.status : (data?.status?.status || data?.batchStatus || '')
    ).toLowerCase()
    const batchSummary = data?.batch_summary
    const isFailed = ['failed', 'error', 'cancelled', 'canceled'].includes(status) ||
      Number(batchSummary?.failed_sets) > 0
    const isComplete = ['completed', 'complete', 'succeeded', 'success'].includes(status) ||
      (Number(batchSummary?.total_input_sets) > 0 &&
        Number(batchSummary?.successful_sets) + Number(batchSummary?.failed_sets) >= Number(batchSummary.total_input_sets))
    if (isFailed) {
      throw new Error(`Harmonization workflow failed: ${JSON.stringify(data)}`)
    }
    if (isComplete) return data
    if (Date.now() > deadline) throw new Error(`Harmonization workflow timed out (batchId: ${batchId})`)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

async function main (params) {
  const logger = Core.Logger('psd-harmonize', { level: params.LOG_LEVEL || 'info' })
  const { presignedUrl, psdPresignedUrl } = params
  const validationError = validate({ presignedUrl, psdPresignedUrl }, params)
  if (validationError) return badRequest(validationError)

  try {
    logger.info(`Harmonization input received: ${JSON.stringify({
      workflowId: params.HARMONIZE_WORKFLOW_ID || WORKFLOW_ID,
      inputNodeId: params.HARMONIZE_INPUT_NODE_ID || INPUT_NODE_ID,
      inputPngUrl: safeUrl(presignedUrl),
      inputPsdUrl: safeUrl(psdPresignedUrl)
    })}`)
    const response = await fetch(WORKFLOW_API_URL, {
      method: 'POST',
      headers: await buildWorkflowHeaders(params, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        workflow: {
          workflowId: params.HARMONIZE_WORKFLOW_ID || WORKFLOW_ID,
          inputs: [[{
            node_id: params.HARMONIZE_INPUT_NODE_ID || INPUT_NODE_ID,
            content: [
              { presignedUrl: psdPresignedUrl, storageType: 'AWS' },
              { presignedUrl, storageType: 'AWS' }
            ]
          }]]
        }
      })
    })
    const submission = await response.json().catch(() => null)
    logger.info(`Harmonization workflow submission: HTTP ${response.status} ${JSON.stringify({
      batchId: submission?.batchId || null,
      keys: submission && typeof submission === 'object' ? Object.keys(submission) : [],
      response: response.ok ? undefined : submission
    })}`)
    if (!response.ok || !submission?.batchId) {
      throw new Error(`Workflow submission returned ${response.status}: ${JSON.stringify(submission)}`)
    }

    const result = await waitForWorkflow(submission.batchId, params, logger)
    const outputAssets = findOutputAssets(result, [presignedUrl, psdPresignedUrl])
    const previewAsset = selectPreviewAsset(outputAssets)
    const psdAsset = selectPsdAsset(outputAssets)
    const harmonizedUrl = previewAsset?.presignedUrl
    logger.info(`Harmonization output lookup: ${JSON.stringify({
      outputUrl: safeUrl(harmonizedUrl),
      assets: outputAssets.map((asset) => ({
        name: asset.name || null,
        mimeType: asset.mimeType || null,
        url: safeUrl(asset.presignedUrl)
      })),
      status: summarizeStatus(result)
    })}`)
    if (!harmonizedUrl) throw new Error(`Workflow completed without an output asset: ${JSON.stringify(result)}`)
    const outputProbe = await fetch(harmonizedUrl, { method: 'HEAD' }).catch((error) => ({ ok: false, status: 0, error }))
    logger.info(`Harmonization output probe: ${JSON.stringify({
      url: safeUrl(harmonizedUrl),
      ok: outputProbe.ok,
      status: outputProbe.status,
      contentType: outputProbe.headers?.get?.('content-type') || null,
      contentLength: outputProbe.headers?.get?.('content-length') || null,
      error: outputProbe.error?.message || null
    })}`)

    logger.info(`Harmonization workflow completed: ${submission.batchId}`)
    return ok({
      ok: true,
      harmonizedUrl,
      harmonizedPsdUrl: psdAsset?.presignedUrl || null,
      jobId: submission.batchId,
      result
    })
  } catch (e) {
    logger.error(e.message)
    logger.error(`Harmonization diagnostic: ${JSON.stringify({
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 3)
    })}`)
    return serverError('Failed to execute the harmonization workflow. Please try again.')
  }
}

exports.main = withCors(main)
