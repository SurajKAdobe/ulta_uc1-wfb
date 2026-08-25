const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { getClient } = require('../libs/photoshopClient')

function validate ({ presignedUrl, outputPutUrl, edits }) {
  if (!presignedUrl) return 'presignedUrl is required'
  if (!outputPutUrl) return 'outputPutUrl is required'
  if (!Array.isArray(edits) || edits.length === 0) return 'edits must be a non-empty array of { id, bounds }'
  return null
}

// Creates (or re-creates) a composite PSD by re-positioning/resizing the layers
// the user dragged on the canvas. "Create" and "edit" are the same call here —
// it always re-reads the original template and re-applies the full current set
// of layer bounds, rather than diffing against a previously saved composite.
// ponytail: no separate "edit an existing composite" path — add one (patching
// just the changed layer ids against the last saved output) if re-running the
// full edit set against the original template stops being fast/accurate enough.
async function main (params) {
  const logger = Core.Logger('psd-composite', { level: params.LOG_LEVEL || 'info' })
  const { presignedUrl, outputPutUrl, edits } = params

  const validationError = validate({ presignedUrl, outputPutUrl, edits })
  if (validationError) return badRequest(validationError)

  try {
    const client = await getClient(params)
    const job = await client.modifyDocument(
      { href: presignedUrl, storage: 'external' },
      { href: outputPutUrl, storage: 'external', type: 'image/vnd.adobe.photoshop' },
      { layers: edits.map(({ id, bounds, visible }) => ({ id, edit: {}, bounds, visible })) }
    )
    await job.pollUntilDone()

    const output = job.outputs?.[0]
    if (output?.status !== 'succeeded') {
      logger.error(`Composite job did not succeed: ${JSON.stringify(output?.errors)}`)
      return serverError('Photoshop could not save the composite.')
    }

    return ok({ ok: true })
  } catch (e) {
    logger.error(e.message)
    return serverError('Failed to save the composite. Please try again.')
  }
}

exports.main = main
