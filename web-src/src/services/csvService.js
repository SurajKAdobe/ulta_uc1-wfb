import { parseCsv, parseCsvRows } from '../utils/csv'

export async function readCsvPreview (file) {
  const text = await file.text()
  return parseCsv(text)
}

// Full per-row extraction used to build the workflow batch payload — one entry
// per CSV record, unlike readCsvPreview's 8-row display cap.
export async function readCsvRows (file) {
  const text = await file.text()
  return parseCsvRows(text)
}
