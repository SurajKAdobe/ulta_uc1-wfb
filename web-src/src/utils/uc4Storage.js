import { callSandbox } from '../services/figmaBridge'

const SESSION_KEY = 'ulta-uc4-session-v1'
const WORKFLOW_SESSION_KEY = 'ulta-uc4-workflow-session-v1'
const EDITOR_SESSION_KEY = 'ulta-uc4-editor-session-v1'
const OUTPUTS_KEY = 'ulta-uc4-saved-outputs-v1'
const MAX_SAVED_OUTPUTS = 50
let pluginStorage = null
let pendingPluginWrite = Promise.resolve()

export async function initializeUc4PluginStorage () {
  const { values } = await callSandbox('GET_UC4_STORAGE', {})
  pluginStorage = values || {}
}

function readJson (key, fallback) {
  try {
    const value = pluginStorage ? pluginStorage[key] : localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    console.warn(`Unable to read UC4 browser storage (${key}).`, error)
    return fallback
  }
}

function writeJson (key, value) {
  try {
    const serialized = JSON.stringify(value)
    if (pluginStorage) {
      pluginStorage[key] = serialized
      const values = { ...pluginStorage }
      pendingPluginWrite = pendingPluginWrite
        .then(() => callSandbox('SET_UC4_STORAGE', { values }))
        .catch((error) => {
          console.warn('Unable to save UC4 plugin storage.', error)
          window.dispatchEvent(new CustomEvent('ulta-uc4-storage-error'))
        })
    } else {
      localStorage.setItem(key, serialized)
    }
    return true
  } catch (error) {
    console.warn(`Unable to save UC4 browser storage (${key}).`, error)
    return false
  }
}

export function readUc4Session () {
  const value = readJson(SESSION_KEY, null)
  const workflow = readJson(WORKFLOW_SESSION_KEY, null)
  const editor = readJson(EDITOR_SESSION_KEY, null)
  if ((!value || value.version !== 1) && !workflow && !editor) return null
  return {
    ...(value?.version === 1 ? value : {}),
    ...(workflow?.version === 1 ? { workflow: workflow.workflow } : {}),
    ...(editor?.version === 1 ? {
      documents: editor.documents,
      activeId: editor.activeId,
      showCampaignInputs: editor.showCampaignInputs
    } : {})
  }
}

export function writeUc4Session (session) {
  const current = readUc4Session() || {}
  const next = { ...current, ...session, version: 1, updatedAt: Date.now() }
  const results = []
  if (Object.prototype.hasOwnProperty.call(session, 'workflow')) {
    results.push(writeJson(WORKFLOW_SESSION_KEY, { version: 1, workflow: next.workflow, updatedAt: next.updatedAt }))
  }
  if (
    Object.prototype.hasOwnProperty.call(session, 'documents') ||
    Object.prototype.hasOwnProperty.call(session, 'activeId') ||
    Object.prototype.hasOwnProperty.call(session, 'showCampaignInputs')
  ) {
    results.push(writeJson(EDITOR_SESSION_KEY, {
      version: 1,
      documents: next.documents || [],
      activeId: next.activeId ?? null,
      showCampaignInputs: next.showCampaignInputs ?? false,
      updatedAt: next.updatedAt
    }))
  }
  return results.every(Boolean)
}

export function readSavedUc4Outputs () {
  const value = readJson(OUTPUTS_KEY, [])
  return Array.isArray(value)
    ? value.filter((output) => output && typeof output.url === 'string' && typeof output.name === 'string')
    : []
}

export function saveUc4Outputs (outputs) {
  const current = readSavedUc4Outputs()
  const merged = [...outputs, ...current]
  const identities = new Set()
  const unique = merged.filter((output) => {
    const identity = output.id || (output.batchId != null
      ? `batch:${output.batchId}:${output.outputIndex}`
      : (output.key ? `key:${output.key}` : `url:${output.url}`))
    if (identities.has(identity)) return false
    identities.add(identity)
    return true
  })
  return writeJson(OUTPUTS_KEY, unique.slice(0, MAX_SAVED_OUTPUTS))
}

export function removeSavedUc4Output (url) {
  return writeJson(OUTPUTS_KEY, readSavedUc4Outputs().filter((output) => output.url !== url))
}
