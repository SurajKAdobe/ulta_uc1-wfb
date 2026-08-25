const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError } = require('../libs/http')
const { getClient } = require('../libs/photoshopClient')
const { getUploadUrls } = require('../libs/s3')

// ponytail: caps the extra rendition job's size/latency rather than requesting one
// per layer no matter how many there are — raise if a real PSD needs more visible+
// nameable layers previewed at once than this.
const MAX_RENDITIONS = 25

// Same tree walk as web-src/src/utils/psdLayers.mjs's flattenLayers, duplicated
// here in CommonJS (this runs server-side, that's an ES module for the bundler) —
// just enough to know which layers are worth spending a rendition call on.
function flattenRenderable (layers, out = []) {
  for (const layer of layers || []) {
    if (layer.bounds && layer.type !== 'layerSection') out.push(layer)
    if (layer.children) flattenRenderable(layer.children, out)
  }
  return out
}

// The manifest's own per-layer thumbnail is the same thumbnail Photoshop's Layers
// panel shows — for a Smart Object that reflects its own embedded/original canvas,
// not how it looks scaled and cropped into its actual on-canvas placement. Request
// a real rendition per layer instead, so the canvas preview matches the real PSD.
//
// One createRendition call per layer, run in parallel — not one call with N
// outputs. Tried the single-job/multi-output form first: in practice the API only
// reliably fulfilled the first output and silently failed the rest, so this is
// the shape that's actually been observed to work for more than one layer.
async function fetchLayerRenditions (client, params, presignedUrl, renderableLayers, logger) {
  const targets = renderableLayers.slice(0, MAX_RENDITIONS)
  if (targets.length === 0) return new Map()

  const results = await Promise.allSettled(targets.map(async (layer) => {
    const { putUrl, getUrl } = await getUploadUrls(params, `uploads/psd-rendition/${Date.now()}-${layer.id}.png`)
    const job = await client.createRendition(
      { href: presignedUrl, storage: 'external' },
      [{ href: putUrl, storage: 'external', type: 'image/png', layers: [{ id: layer.id }] }]
    )
    const jobOutput = job.outputs?.[0]
    if (jobOutput?.status !== 'succeeded') {
      throw new Error(`status ${jobOutput?.status}: ${JSON.stringify(jobOutput?.errors)}`)
    }
    return { id: layer.id, url: getUrl }
  }))

  const renditionById = new Map()
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      renditionById.set(result.value.id, result.value.url)
    } else {
      logger.error(`Rendition failed for layer ${targets[i].id} (${targets[i].name}): ${result.reason?.message || result.reason}`)
    }
  })
  return renditionById
}

// createRendition (even with a single-layer `layers` filter and no explicit
// trimToCanvas) has been observed to return the rendition at the *full document
// canvas size*, with just that layer's pixels placed at their real position and
// everything else transparent — not cropped to the layer's own bounds despite
// what the trimToCanvas docs describe. Flagging that here so the frontend crops
// it out itself (like a sprite sheet) instead of trusting the API to have done it.
function applyRenditions (layers, renditionById) {
  return (layers || []).map((layer) => {
    const rendition = renditionById.get(layer.id)
    return {
      ...layer,
      thumbnail: rendition || layer.thumbnail,
      thumbnailIsFullCanvas: !!rendition,
      children: layer.children ? applyRenditions(layer.children, renditionById) : layer.children
    }
  })
}

async function main (params) {
  const logger = Core.Logger('psd-manifest', { level: params.LOG_LEVEL || 'info' })
  const { presignedUrl } = params

  if (!presignedUrl) return badRequest('presignedUrl is required')

  try {
    const client = await getClient(params)
    const job = await client.getDocumentManifest(
      { href: presignedUrl, storage: 'external' },
      { thumbnails: { type: 'image/png' } }
    )
    await job.pollUntilDone()

    const output = job.outputs?.[0]
    if (output?.status !== 'succeeded') {
      logger.error(`Manifest job did not succeed: ${JSON.stringify(output?.errors)}`)
      return serverError('Photoshop could not read this PSD file.')
    }

    // The real API response uses "layers" (plural) — @adobe/aio-lib-photoshop-api's
    // own JobOutput JSDoc typedef documents it as "layer" (singular), which doesn't
    // match and always came back undefined. Falling back to .layer just in case.
    const rawLayers = output.layers || output.layer

    let renditionById = new Map()
    try {
      const renderable = flattenRenderable(rawLayers)
      renditionById = await fetchLayerRenditions(client, params, presignedUrl, renderable, logger)
    } catch (e) {
      // A rendition is a preview-quality upgrade, not required to use the tool at
      // all — fall back to the manifest's own (less accurate) thumbnails rather
      // than failing the whole upload over it.
      logger.error(`Layer rendition job failed, falling back to manifest thumbnails: ${e.message}`)
    }

    return ok({ ok: true, document: output.document, layers: applyRenditions(rawLayers, renditionById) })
  } catch (e) {
    logger.error(e.message)
    return serverError('Failed to read the PSD layer manifest. Please try again.')
  }
}

exports.main = main
