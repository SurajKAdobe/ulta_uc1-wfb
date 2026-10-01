// Plugin sandbox entry point. Mostly just hosts the existing web app inside
// the Figma UI panel, except for two things only this thread can do: relay
// storage uploads (the UI iframe's data: URL origin gets CORS-blocked by
// Adobe I/O Files' storage; this thread isn't loaded from a data: URL and
// doesn't hit that), and turn a PSD's layers into real Figma nodes so they
// can be edited with Figma's own tools instead of the DOM-based LayerCanvas
// editor (web app only; that editor stays as the non-Figma fallback).
figma.showUI(__html__, {
  width: 1400,
  height: 900,
  title: "Ulta Beauty — Batch Workflow Automation",
});

// Every relay message shares one reply convention: `{type: '<TYPE>_RESULT',
// message: {requestId, ok, error, ...extra}}` — see
// web-src/src/services/figmaBridge.js for the UI-side half of this.
function reply(requestType, requestId, extra) {
  figma.ui.postMessage({
    type: `${requestType}_RESULT`,
    message: { requestId, ok: true, error: null, ...extra },
  });
}

function replyError(requestType, requestId, error) {
  figma.ui.postMessage({
    type: `${requestType}_RESULT`,
    message: { requestId, ok: false, error: error?.message || String(error) },
  });
}

async function handleStoragePut({ requestId, url, contentType, bytes }) {
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    reply("STORAGE_PUT", requestId, {});
  } catch (e) {
    replyError("STORAGE_PUT", requestId, e);
  }
}

// Maps a layer's own bounds (in document-pixel space) onto a node sized to
// exactly those bounds, rotated around the box's own center — the same pivot
// LayerCanvas's CSS `transform: rotate()` uses, and the pivot psd-composite's
// `transform.offset/dimension/angle` was written against. Figma's node.x/y
// get silently readjusted by Figma itself when node.rotation is set after the
// fact (documented: "changes its x and y such that the top-left corner...
// stays in the same position"), which doesn't match that pivot — setting
// relativeTransform directly sidesteps that entirely, and (paired with
// nodeCenterFromTransform below) makes the sync-back math exact regardless of
// how Figma internally bookkeeps x/y for a rotated node.
function boundsToTransform({ left, top, width, height, rotate }) {
  const rad = ((rotate || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  return [
    [cos, -sin, centerX - (width / 2) * cos + (height / 2) * sin],
    [sin, cos, centerY - (width / 2) * sin - (height / 2) * cos],
  ];
}

// Inverse of the above: recovers {left, top, rotate} from a node's current
// relativeTransform + width/height, regardless of whatever Figma did to its
// x/y internally while the user dragged/resized/rotated it in the editor.
function transformToBounds(transform, width, height) {
  const [[a, c, tx], [b, d, ty]] = transform;
  const centerX = a * (width / 2) + c * (height / 2) + tx;
  const centerY = b * (width / 2) + d * (height / 2) + ty;
  const rotateDeg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
    rotate: rotateDeg,
  };
}

// v1-style layer types (see actions/psd-manifest/index.js's V1_LAYER_TYPE,
// and this app's own {type: 'layerSection'|'background'|...} vocabulary
// throughout) already exclude groups/background before this ever runs (see
// SkuPersonalization.js) — every layer handed here is a real, positionable
// leaf layer with a rendition thumbnail.
async function handleExportToCanvas({ requestId, fileName, document, layers }) {
  try {
    const frame = figma.createFrame();
    frame.name = `PSD — ${fileName}`;
    frame.resize(Math.max(1, document.width), Math.max(1, document.height));
    frame.x = figma.viewport.center.x - document.width / 2;
    frame.y = figma.viewport.center.y - document.height / 2;
    frame.fills = [];

    // Manifest order isn't reliable paint order across API versions (see
    // LayerCanvas.js's own index-sort fix for the same reason) — sort by the
    // manifest's own numeric z-order before appending, so earlier children
    // (further back) get added to the frame first.
    const ordered = [...layers].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    for (const layer of ordered) {
      const node = figma.createRectangle();
      node.name = layer.name;
      node.resize(
        Math.max(1, layer.bounds.width),
        Math.max(1, layer.bounds.height),
      );
      node.relativeTransform = boundsToTransform(layer.bounds);
      node.visible = layer.visible !== false;
      // The background layer is placed for visual reference only — it's never
      // sent back as an edit (Photoshop v2 can't locate it by name for one
      // anyway, see figmaCanvasService.js) — lock it so it can't be dragged
      // out of place for no effect.
      node.locked = !!layer.locked;
      node.setPluginData("layerId", String(layer.id));
      node.setPluginData("layerType", layer.type);
      node.setPluginData("layerName", layer.name);

      if (layer.thumbnail) {
        const imageResponse = await fetch(layer.thumbnail);
        const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
        const image = figma.createImage(imageBytes);

        if (layer.thumbnailIsFullCanvas) {
          // The rendition is a full-document-canvas image with just this
          // layer's pixels opaque at their real position (see
          // actions/psd-manifest/index.js) — crop out just this layer's own
          // region via imageTransform rather than stretching the whole
          // document image into this one node's small box.
          const sx = layer.bounds.width / document.width;
          const sy = layer.bounds.height / document.height;
          const tx = layer.bounds.left / document.width;
          const ty = layer.bounds.top / document.height;
          node.fills = [
            {
              type: "IMAGE",
              scaleMode: "CROP",
              imageHash: image.hash,
              imageTransform: [
                [sx, 0, tx],
                [0, sy, ty],
              ],
            },
          ];
        } else {
          node.fills = [
            { type: "IMAGE", scaleMode: "FILL", imageHash: image.hash },
          ];
        }
      }

      frame.appendChild(node);
    }

    figma.currentPage.appendChild(frame);
    figma.viewport.scrollAndZoomIntoView([frame]);
    reply("EXPORT_PSD_TO_CANVAS", requestId, { frameId: frame.id });
  } catch (e) {
    replyError("EXPORT_PSD_TO_CANVAS", requestId, e);
  }
}

async function handleSyncFromCanvas({ requestId, frameId }) {
  try {
    const frame = figma.getNodeById(frameId);
    if (!frame || frame.removed) {
      throw new Error(
        "The exported layers were not found on the canvas — were they deleted?",
      );
    }
    const edits = frame.children
      .filter((child) => child.getPluginData("layerId"))
      .map((child) => ({
        id: Number(child.getPluginData("layerId")),
        bounds: transformToBounds(
          child.relativeTransform,
          child.width,
          child.height,
        ),
        visible: child.visible,
      }));
    reply("SYNC_PSD_FROM_CANVAS", requestId, { edits });
  } catch (e) {
    replyError("SYNC_PSD_FROM_CANVAS", requestId, e);
  }
}

async function handleUc4Storage(type, { requestId, values }) {
  try {
    if (type === "GET_UC4_STORAGE") {
      const stored = await figma.clientStorage.getAsync("ulta-uc4-storage-v1");
      reply(type, requestId, { values: stored || {} });
    } else {
      await figma.clientStorage.setAsync("ulta-uc4-storage-v1", values);
      reply(type, requestId, {});
    }
  } catch (error) {
    replyError(type, requestId, error);
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg?.type === "GET_UC4_STORAGE" || msg?.type === "SET_UC4_STORAGE")
    return handleUc4Storage(msg.type, msg.message);
  if (msg?.type === "STORAGE_PUT") return handleStoragePut(msg.message);
  if (msg?.type === "EXPORT_PSD_TO_CANVAS")
    return handleExportToCanvas(msg.message);
  if (msg?.type === "SYNC_PSD_FROM_CANVAS")
    return handleSyncFromCanvas(msg.message);
  if (msg?.type === "RESIZE_WINDOW")
    return figma.ui.resize(msg.size.width, msg.size.height);
};
