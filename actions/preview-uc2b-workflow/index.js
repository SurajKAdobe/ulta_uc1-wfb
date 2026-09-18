const { ok, withCors } = require('../libs/http')

// Preview-only — never calls Workflow Builder. Mirrors execute-uc2b-workflow's
// payload exactly, so the curl preview shown to the user is the real request.
function buildPreviewInputs (csvPresignedUrl, templatePsdPresignedUrl, params) {
  return [[
    { node_id: params.UC2B_INPUT_CSV_NODE_ID, content: [{ presignedUrl: csvPresignedUrl || '{presigned_url}', storageType: 'AWS' }] },
    { node_id: params.UC2B_INPUT_TEMPLATE_NODE_ID, template: { presignedUrl: templatePsdPresignedUrl || '{presigned_url}', storageType: 'AWS' } }
  ]]
}

async function main (params) {
  const { csvPresignedUrl, templatePsdPresignedUrl } = params
  const inputs = buildPreviewInputs(csvPresignedUrl, templatePsdPresignedUrl, params)

  return ok({
    ok: true,
    url: 'https://run-workflow.adobe.io/batch/execute',
    body: { workflow: { workflowId: params.UC2B_WORKFLOW_ID, inputs } }
  })
}

exports.main = withCors(main)
