import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../../web-src/src/components/App'
import '../../../web-src/src/styles/ulta-theme.css'

// Read by web-src/src/services/uploadService.js to relay storage PUTs through
// the plugin's sandbox thread instead of fetching directly from this iframe —
// see the comment there for why (a CORS issue only this entry point hits).
window.__FIGMA_PLUGIN__ = true

// Figma's UI iframe has no visible devtools by default, so an uncaught
// error before/during React's first render otherwise just leaves a blank
// panel with no clue why. Surface it directly in the DOM instead.
function renderFatalError (error) {
  const root = document.getElementById('root')
  root.innerHTML = ''
  const pre = document.createElement('pre')
  pre.style.cssText = 'padding:16px;margin:0;color:#c00;white-space:pre-wrap;font-family:monospace;font-size:12px;'
  pre.textContent = 'Plugin UI failed to load:\n\n' + (error && error.stack ? error.stack : String(error))
  root.appendChild(pre)
}

window.addEventListener('error', (event) => renderFatalError(event.error || event.message))
window.addEventListener('unhandledrejection', (event) => renderFatalError(event.reason))

try {
  const root = createRoot(document.getElementById('root'))
  root.render(<App />)
} catch (error) {
  renderFatalError(error)
}
