const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { runJob } = require('../libs/photoshopV2')

// v1 manifest layer.type values (what we already have on hand) -> v2's
// snake_case edit-layer type enum. v2's discriminated edit-layer schema needs
// this to know which layer schema variant applies, on top of operation.type
// (add/edit/delete/move). Falls back to the generic 'layer' for anything
// unmapped rather than failing the save over a type we haven't seen yet.
const V2_LAYER_TYPE = {
  smartObject: 'smart_object_layer',
  textLayer: 'text_layer',
  adjustmentLayer: 'adjustment_layer',
  fillLayer: 'solid_color_layer',
  layerSection: 'group_layer',
  background: 'background_layer'
}

function validate ({ presignedUrl, outputPutUrl, edits }) {
  if (!presignedUrl) return 'presignedUrl is required'
  if (!outputPutUrl) return 'outputPutUrl is required'
  if (!Array.isArray(edits) || edits.length === 0) return 'edits must be a non-empty array of { id, bounds }'
  return null
}

// Creates (or re-creates) a composite PSD by re-positioning/resizing/rotating the
// layers the user edited on the canvas. "Create" and "edit" are the same call
// here — it always re-reads the original template and re-applies the full
// current set of layer edits, rather than diffing against a previously saved
// composite.
// ponytail: no separate "edit an existing composite" path — add one (patching
// just the changed layer ids against the last saved output) if re-running the
// full edit set against the original template stops being fast/accurate enough.
//
// Uses the Photoshop v2 API (not v1, like psd-manifest) specifically because
// v1's Layer edit schema has no rotation field at all (verified against the
// SDK's own type defs) — v2's Transform has a proper `angle`. v2 needs its own
// Firefly Services entitlement on the OAuth S2S credential (see
// actions/libs/photoshopV2.js) — this is unverified against a live v2 call as
// of writing; watch the logs on first save after this change.
async function main (params) {
  const logger = Core.Logger('psd-composite', { level: params.LOG_LEVEL || 'info' })
  const { presignedUrl, outputPutUrl, edits } = params

  const validationError = validate({ presignedUrl, outputPutUrl, edits })
  if (validationError) return badRequest(validationError)

  try {
    const result = await runJob('/v2/create-composite', {
      image: { source: { url: presignedUrl } },
      edits: {
        layers: edits.map(({ name, type, bounds, visible }) => ({
          // Targeting by name, not id — these ids came from a v1 manifest read
          // (psd-manifest), and v1/v2 are different pipelines; a v1 id may not
          // resolve to any layer in v2's own view of the document, in which
          // case the edit is just silently skipped (no error, no effect).
          name,
          type: V2_LAYER_TYPE[type] || 'layer',
          operation: { type: 'edit' },
          isVisible: visible,
          // transformMode 'custom' is required for an explicit transform block
          // to take effect at all — otherwise it's rejected outright.
          transformMode: 'custom',
          transform: {
            offset: { horizontal: bounds.left, vertical: bounds.top },
            dimension: { width: bounds.width, height: bounds.height },
            angle: bounds.rotate || 0
          }
        }))
      },
      outputs: [{ destination: { url: outputPutUrl }, mediaType: 'image/vnd.adobe.photoshop' }]
    }, params, 270000)

    // The job's own success/failure is reported at the whole-job level, but
    // whether each individual layer edit actually matched and applied isn't
    // something we've seen documented — log the full result so a "succeeded but
    // nothing changed" outcome is visible in the logs instead of a silent no-op.
    logger.debug(`create-composite job result: ${JSON.stringify(result)}`)

    return ok({ ok: true })
  } catch (e) {
    logger.error(e.message)
    return serverError('Failed to save the composite. Please try again.')
  }
}

exports.main = main
