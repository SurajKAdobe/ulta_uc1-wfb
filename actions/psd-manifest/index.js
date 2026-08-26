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

// Reads just the PNG header (signature + IHDR chunk) via a byte-range request
// to get the rendition's *actual* pixel dimensions, rather than assuming one
// shape — createRendition's real behavior here has flip-flopped between "full
// document canvas, this layer's pixels placed at their real position" and
// (with trimToCanvas explicitly set) a tight per-layer crop, and guessing wrong
// either way silently breaks the preview. Ground truth beats another guess.
async function probePngSize (url) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-33' } })
  if (!response.ok) return null
  const buf = Buffer.from(await response.arrayBuffer())
  // 8-byte PNG signature + 4-byte chunk length + 4-byte "IHDR" + 4-byte width + 4-byte height
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
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
async function fetchLayerRenditions (client, params, presignedUrl, renderableLayers, documentSize, logger) {
  const targets = renderableLayers.slice(0, MAX_RENDITIONS)
  if (targets.length === 0) return new Map()

  const results = await Promise.allSettled(targets.map(async (layer) => {
    const { putUrl, getUrl } = await getUploadUrls(params, `uploads/psd-rendition/${Date.now()}-${layer.id}.png`)
    const job = await client.createRendition(
      { href: presignedUrl, storage: 'external' },
      // trimToCanvas: false asks for the layer's own tight crop (per the SDK's
      // Output typedef) — previously left unset, which in practice still came
      // back full-canvas-sized. Explicit here in case that only takes effect
      // when the field is actually present. Verified either way by probePngSize
      // below, not assumed.
      //
      // ponytail: no `width` upscale request here (tried it — asking a small
      // layer's tight crop to render at a much bigger width, e.g. requesting
      // 1920px for a 77px-wide layer, came back blank rather than upscaled;
      // background-sized layers survived a modest upscale, small ones didn't
      // survive an extreme one). Renders come back at whatever size Photoshop
      // naturally produces for the crop; resizing a layer well past that in the
      // canvas will look soft. Revisit with a *per-layer* modest multiplier
      // (not a single value shared by every layer regardless of its own size)
      // if that's worth solving later.
      [{ href: putUrl, storage: 'external', type: 'image/png', trimToCanvas: false, layers: [{ id: layer.id }] }]
    )
    const jobOutput = job.outputs?.[0]
    if (jobOutput?.status !== 'succeeded') {
      throw new Error(`status ${jobOutput?.status}: ${JSON.stringify(jobOutput?.errors)}`)
    }

    const size = await probePngSize(getUrl).catch(() => null)
    const isFullCanvas = !size || (
      documentSize?.width && Math.abs(size.width - documentSize.width) <= 2 &&
      Math.abs(size.height - documentSize.height) <= 2
    )
    return { id: layer.id, url: getUrl, isFullCanvas }
  }))

  const renditionById = new Map()
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      renditionById.set(result.value.id, result.value)
    } else {
      logger.error(`Rendition failed for layer ${targets[i].id} (${targets[i].name}): ${result.reason?.message || result.reason}`)
    }
  })
  return renditionById
}

function applyRenditions (layers, renditionById) {
  return (layers || []).map((layer) => {
    const rendition = renditionById.get(layer.id)
    return {
      ...layer,
      thumbnail: rendition?.url || layer.thumbnail,
      // Ground-truthed per probePngSize — LayerCanvas picks its rendering
      // strategy (crop-like-a-sprite-sheet vs. a normal <img>) off this, not an
      // assumption baked in here.
      thumbnailIsFullCanvas: rendition ? rendition.isFullCanvas : false,
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
      renditionById = await fetchLayerRenditions(client, params, presignedUrl, renderable, output.document, logger)
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
