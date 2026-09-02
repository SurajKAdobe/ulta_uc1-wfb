// Main thread (Figma plugin sandbox). No build step — plain JS, run as-is.
//
// This plugin is a thin Figma-hosted front end for the *same* UC4 backend the
// web app uses (actions/execute-uc4-workflow, check-status, presign-upload —
// see ../web-src/src/services/uc4WorkflowService.js, workflowService.js,
// uploadService.js). All of that runs unchanged; this plugin just replaces
// the AEM/React shell with a Figma panel. All actual work (uploads, Workflow
// Builder execute/poll, CSV parsing) happens in ui.html, since it's plain
// HTTPS calls an iframe can make directly. The main thread here only does two
// things the UI can't do itself: persist the API base URL across sessions
// (figma.clientStorage) and open an external URL (figma.openExternal) for
// downloading a finished output PSD.

figma.showUI(__html__, { width: 380, height: 700 })

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'load-settings') {
    const apiBaseUrl = await figma.clientStorage.getAsync('apiBaseUrl')
    figma.ui.postMessage({ type: 'settings', apiBaseUrl: apiBaseUrl || '' })
  } else if (msg.type === 'save-settings') {
    await figma.clientStorage.setAsync('apiBaseUrl', msg.apiBaseUrl)
  } else if (msg.type === 'open-external') {
    figma.openExternal(msg.url)
  } else if (msg.type === 'insert-image') {
    insertImage(msg.name, msg.bytes)
  }
}

// Figma can't open a .psd, but a PNG rendition (when the batch produces one —
// see extractUc4OutputPngs in ui.html) can be dropped straight onto the
// canvas as an image-filled rectangle, sized to the image's native dimensions.
function insertImage (name, byteArray) {
  const image = figma.createImage(new Uint8Array(byteArray))
  image.getSizeAsync().then(({ width, height }) => {
    const rect = figma.createRectangle()
    rect.name = name
    rect.resize(width, height)
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }]
    figma.currentPage.appendChild(rect)
    figma.currentPage.selection = [rect]
    figma.viewport.scrollAndZoomIntoView([rect])
  })
}
