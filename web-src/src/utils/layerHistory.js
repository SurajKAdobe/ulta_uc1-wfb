// Plain-object undo/redo history — not a React hook, since SkuPersonalization
// keeps one of these per open PSD document inside a single `documents` array
// state, and hooks can't be called per-array-item in a loop. `push` truncates
// any redo branch past the current point, same as a normal editor undo stack.
export function createHistory (initial) {
  return { entries: [initial], index: 0 }
}

export function historyState (history) {
  return history.entries[history.index]
}

export function pushHistory (history, next) {
  return { entries: [...history.entries.slice(0, history.index + 1), next], index: history.index + 1 }
}

export function undoHistory (history) {
  return { ...history, index: Math.max(0, history.index - 1) }
}

export function redoHistory (history) {
  return { ...history, index: Math.min(history.entries.length - 1, history.index + 1) }
}

export function canUndoHistory (history) {
  return history.index > 0
}

export function canRedoHistory (history) {
  return history.index < history.entries.length - 1
}
