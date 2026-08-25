// Splits one CSV line into fields, honoring double-quoted fields (which may
// contain commas and "" as an escaped quote).
function splitCsvLine (line) {
  const fields = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      fields.push(field.trim())
      field = ''
    } else {
      field += c
    }
  }
  fields.push(field.trim())
  return fields
}

// Header names the Workflow Builder graph's per-row text inputs are sourced from.
// Matched case-insensitively/trimmed so minor header formatting drift doesn't break it.
const WORKFLOW_ROW_COLUMNS = {
  sku: "Sku's for Image",
  filename: 'Amplience Image Name',
  background: 'Firefly | Background',
  templateSize: 'Firefly | Template'
}

function normalizeHeader (h) {
  return h.trim().toLowerCase()
}

function buildColumnIndex (headers) {
  const index = {}
  for (const [field, headerName] of Object.entries(WORKFLOW_ROW_COLUMNS)) {
    index[field] = headers.findIndex(h => normalizeHeader(h) === normalizeHeader(headerName))
  }
  return index
}

// One row per CSV record (no preview limit) shaped for buildWorkflowInputs — each
// row becomes one execution's worth of per-row text inputs in the batch payload.
export function parseCsvRows (text) {
  const lines = text.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [], missingColumns: Object.values(WORKFLOW_ROW_COLUMNS) }

  const headers = splitCsvLine(lines[0])
  const columnIndex = buildColumnIndex(headers)
  const missingColumns = Object.entries(columnIndex)
    .filter(([, idx]) => idx === -1)
    .map(([field]) => WORKFLOW_ROW_COLUMNS[field])

  const dataLines = lines.slice(1)
  const rows = missingColumns.length > 0
    ? []
    : dataLines.map(line => {
      const cells = splitCsvLine(line)
      return {
        sku: cells[columnIndex.sku] || '',
        filename: cells[columnIndex.filename] || '',
        background: cells[columnIndex.background] || '',
        templateSize: cells[columnIndex.templateSize] || ''
      }
    })

  return { headers, rows, missingColumns }
}

// Returns every data row (CsvUpload paginates client-side rather than this
// function truncating), plus recordCount for convenience.
export function parseCsv (text) {
  const lines = text.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [], recordCount: 0 }

  const headers = splitCsvLine(lines[0])
  const dataLines = lines.slice(1)
  const rows = dataLines.map(splitCsvLine)

  return { headers, rows, recordCount: dataLines.length }
}
