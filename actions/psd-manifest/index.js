const { Core } = require('@adobe/aio-sdk')
const { ok, badRequest, serverError, withCors } = require('../libs/http')
const { runJob } = require('../libs/photoshopV2')
const { getUploadUrls } = require('../libs/storage')

// v1 (image.adobe.io, actions/libs/photoshopClient.js) is retired — this account's
// credential now gets a 403 ErrRetired from it ("This API is being retired and is
// no longer available to new clients"). Moved to v2 (photoshop-api.adobe.io,
// actions/libs/photoshopV2.js), same client psd-composite already uses.

// ponytail: caps the extra rendition job's size/latency rather than requesting one
// per layer no matter how many there are — raise if a real PSD needs more visible+
// nameable layers previewed at once than this.
const MAX_RENDITIONS = 25
const MANIFEST_JOB_TIMEOUT_MS = 60000
const RENDITION_JOB_TIMEOUT_MS = 45000

// v2's /v2/generate-manifest response uses an entirely different vocabulary than
// v1 did: no `bounds` field at all (position/size live under `compositeFrame.
// absolute` as {left,top,right,bottom}), snake_case `type` values, and rotation
// as a top-level `rotation` number rather than `rotate`. Every other consumer of
// this action's output — web-src/src/utils/psdLayers.mjs (which already has a
// bounds-shape shim anticipating exactly this), LayerCanvas.js, LayerList.js,
// SkuPersonalization.js, and psd-composite's own V2_LAYER_TYPE map for the write
// side — is built against v1's shape. Normalizing back to that shape here, once,
// keeps the v2/v1 vocabulary difference contained to this one action instead of
// rippling through the frontend and psd-composite.
const V1_LAYER_TYPE = {
  smart_object_layer: 'smartObject',
  text_layer: 'textLayer',
  adjustment_layer: 'adjustmentLayer',
  solid_color_layer: 'fillLayer',
  group_layer: 'layerSection',
  background_layer: 'background',
  artboard: 'layerSection' // no v1 analog; closest fit for "is a container"
}

function toV1Bounds (frame) {
  if (!frame) return null
  const { left, top, right, bottom } = frame
  if (left == null || top == null || right == null || bottom == null) return null
  return { left, top, width: right - left, height: bottom - top }
}

function normalizeLayers (layers) {
  return (layers || []).map((layer) => ({
    ...layer,
    type: V1_LAYER_TYPE[layer.type] || layer.type,
    bounds: toV1Bounds(layer.compositeFrame?.absolute),
    rotate: layer.rotation || 0,
    children: layer.children ? normalizeLayers(layer.children) : layer.children
  }))
}

function normalizeDocument (document) {
  if (!document) return document
  const bounds = toV1Bounds(document.bounds)
  return bounds ? { ...document, width: bounds.width, height: bounds.height } : document
}

// Same tree walk as web-src/src/utils/psdLayers.mjs's flattenLayers, duplicated
// here in CommonJS (this runs server-side, that's an ES module for the bundler) —
// just enough to know which layers are worth spending a rendition call on. Runs
// against the already-normalized (v1-shaped) tree.
function flattenRenderable (layers, out = []) {
  for (const layer of layers || []) {
    if (layer.bounds && layer.type !== 'layerSection') out.push(layer)
    if (layer.children) flattenRenderable(layer.children, out)
  }
  return out
}

// Reads just the PNG header (signature + IHDR chunk) via a byte-range request
// to get the rendition's *actual* pixel dimensions, rather than assuming one
// shape — create-composite's real behavior here has flip-flopped between "full
// document canvas, this layer's pixels placed at their real position" and a
// tight per-layer crop depending on cropMode, and guessing wrong either way
// silently breaks the preview. Ground truth beats another guess.
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
// One create-composite call per layer, run in parallel — not one call with N
// outputs. Tried the single-job/multi-output form first (on v1's createRendition):
// in practice the API only reliably fulfilled the first output and silently failed
// the rest, so this is the shape that's actually been observed to work for more
// than one layer. cropMode: 'document_bounds' asks for this one layer composited
// at its real position within the full canvas (not cropped to its own bounds) —
// verified by probePngSize below, not assumed.
async function fetchLayerRenditions (presignedUrl, renderableLayers, documentSize, logger, params) {
  const targets = renderableLayers.slice(0, MAX_RENDITIONS)
  if (targets.length === 0) return new Map()

  const results = await Promise.allSettled(targets.map(async (layer) => {
    const { putUrl, getUrl } = await getUploadUrls(`uploads/psd-rendition/${Date.now()}-${layer.id}.png`)
    await runJob('/v2/create-composite', {
      image: { source: { url: presignedUrl } },
      outputs: [{
        destination: { url: putUrl },
        mediaType: 'image/png',
        layers: [{ id: layer.id }],
        cropMode: 'document_bounds'
      }]
    }, params, RENDITION_JOB_TIMEOUT_MS)

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
    // generate-manifest writes its result to a destination URL rather than
    // returning it inline in the job status (unlike v1's SDK, which handed the
    // manifest back as part of the job object itself) — mint a short-lived
    // put/get pair to receive it, then read it straight back.
    const { putUrl: manifestPutUrl, getUrl: manifestGetUrl } = await getUploadUrls(`uploads/psd-manifest-json/${Date.now()}.json`)

    await runJob('/v2/generate-manifest', {
      image: { source: { url: presignedUrl } },
      outputs: [{ destination: { url: manifestPutUrl }, mediaType: 'application/json' }]
    }, params, MANIFEST_JOB_TIMEOUT_MS)

    const manifestResponse = await fetch(manifestGetUrl)
    if (!manifestResponse.ok) {
      throw new Error(`Could not read generated manifest (${manifestResponse.status})`)
    }
    const manifest = await manifestResponse.json()
    const document = normalizeDocument(manifest.document)
    const rawLayers = normalizeLayers(manifest.layers || manifest.layer)

    let renditionById = new Map()
    try {
      const renderable = flattenRenderable(rawLayers)
      renditionById = await fetchLayerRenditions(presignedUrl, renderable, document, logger, params)
    } catch (e) {
      // A rendition is a preview-quality upgrade, not required to use the tool at
      // all — fall back to the manifest's own (less accurate) thumbnails rather
      // than failing the whole upload over it.
      logger.error(`Layer rendition job failed, falling back to manifest thumbnails: ${e.message}`)
    }

    return ok({ ok: true, document, layers: applyRenditions(rawLayers, renditionById) })
  } catch (e) {
    logger.error(e.message)
    return serverError('Failed to read the PSD layer manifest. Please try again.')
  }
}

exports.main = withCors(main)
