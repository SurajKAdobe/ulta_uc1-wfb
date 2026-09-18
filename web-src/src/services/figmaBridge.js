// Central postMessage bridge between this UI (iframe) and the Figma plugin's
// sandbox thread (figma-plugin/src/plugin/controller.js). Only ever imported
// when window.__FIGMA_PLUGIN__ is set (see figma-plugin/src/ui/index.js) —
// the plain web app has no sandbox thread to talk to.
//
// Exactly one `window.onmessage` for the whole app: Figma's plugin UI bridge
// doesn't reliably deliver through addEventListener('message', ...) (found by
// direct testing — the sandbox's replies never arrived until this switched to
// a plain assignment), and only one function can hold that assignment at a
// time, so every relay-based feature shares this one dispatcher instead of
// each rolling its own listener and silently clobbering the others.
let requestCounter = 0
const pending = new Map()
const DEFAULT_TIMEOUT_MS = 120000

if (typeof window !== 'undefined') {
  window.onmessage = (event) => {
    const envelope = event.data?.pluginMessage
    const requestId = envelope?.message?.requestId
    if (!requestId) return
    const entry = pending.get(requestId)
    if (!entry) return
    pending.delete(requestId)
    clearTimeout(entry.timeoutId)
    if (envelope.message.ok) entry.resolve(envelope.message)
    else entry.reject(new Error(envelope.message.error || 'The plugin sandbox reported a failure.'))
  }
}

// Sends {type, message: {...payload, requestId}} to the sandbox and resolves
// with the matching `{type: '<type>_RESULT'}` reply's `message` (minus the
// ok/error bookkeeping fields, which are already handled here) — or rejects
// on failure or timeout. See controller.js's reply()/replyError() for the
// sandbox side of this contract.
export function callSandbox (type, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const requestId = `${type}-${Date.now()}-${++requestCounter}`
  const result = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('The plugin sandbox never responded. Please try again.'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timeoutId })
  })
  window.parent.postMessage({ pluginMessage: { type, message: { ...payload, requestId } } }, '*')
  return result
}
