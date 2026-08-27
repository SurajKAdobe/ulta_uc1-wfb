import { parseCsv, parseCsvRows, parseUc4Csv } from '../utils/csv'

export async function readCsvPreview (file) {
  const text = await file.text()
  return parseCsv(text)
}

// UC4's CSV has no header row — see parseUc4Csv.
export async function readUc4CsvPreview (file) {
  const text = await file.text()
  return parseUc4Csv(text)
}

// Full per-row extraction used to build the workflow batch payload — one entry
// per CSV record, unlike readCsvPreview's 8-row display cap.
export async function readCsvRows (file) {
  const text = await file.text()
  return parseCsvRows(text)
}
