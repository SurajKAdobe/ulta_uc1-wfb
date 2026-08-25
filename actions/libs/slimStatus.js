// Workflow Builder's status payload embeds a full provenance/event history
// (and, on conflicts, a "__conflicts" dump) on every node's content — these
// repeat and grow with every execution/asset in the batch, and the frontend
// never reads them (it only needs presignedUrl/name/mimeType/acpFolderUrl per
// node, plus the top-level counts). Left in, a near-complete 10-row batch's
// status response is large enough to blow past the platform's action-result
// size limit, which surfaces as an opaque gateway error instead of the real
// payload-too-large problem. Stripping these keys recursively fixes that
// without needing to know which node ids the frontend cares about.
const BLOAT_KEYS = new Set(['provenance', '__conflicts'])

function stripBloat (value) {
  if (Array.isArray(value)) {
    return value.map(stripBloat)
  }
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, val] of Object.entries(value)) {
      if (BLOAT_KEYS.has(key)) continue
      result[key] = stripBloat(val)
    }
    return result
  }
  return value
}

module.exports = { stripBloat }
