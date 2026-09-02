// Minimal self-check for the CSV/status parsing logic ported into ui.html
// (Figma plugin UI is a single self-contained HTML string — no module system
// to import from, so these are copies kept in sync with ui.html, same as
// ui.html's own copies are kept in sync with web-src/src/utils/csv.js).
// Run: node test.js
const assert = require('assert')

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

function normalizeHeader (h) {
  return h.trim().toLowerCase().replace(/\s*\|\s*/g, '|')
}

const UC4_SKU_ALIASES = ['image|sku', 'sku', 'skus', "sku's", 'sku id', 'sku ids']
const UC4_NAME_ALIASES = ['name', 'offer name', 'offer', 'title']

function findUc4ColumnIndex (headers, aliases) {
  return headers.findIndex((h) => aliases.includes(normalizeHeader(h)))
}

function parseUc4Csv (text) {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { headers: [], rows: [], recordCount: 0, skuIndex: -1, nameIndex: -1, missingColumns: ['Image | Sku'] }
  }
  const headers = splitCsvLine(lines[0])
  const skuIndex = findUc4ColumnIndex(headers, UC4_SKU_ALIASES)
  const nameIndex = findUc4ColumnIndex(headers, UC4_NAME_ALIASES)
  const missingColumns = skuIndex === -1 ? ['Image | Sku'] : []
  const rows = lines.slice(1).map(splitCsvLine).filter((cells) => cells.some((c) => c !== ''))
  return { headers, rows, recordCount: rows.length, skuIndex, nameIndex, missingColumns }
}

const csv = parseUc4Csv('Image | Sku,Name\n"123,456",Bobbi Brown Valid Offer\n,,\n')
assert.strictEqual(csv.skuIndex, 0)
assert.strictEqual(csv.nameIndex, 1)
assert.strictEqual(csv.recordCount, 1) // trailing all-blank line dropped
assert.deepStrictEqual(csv.rows[0], ['123,456', 'Bobbi Brown Valid Offer'])

const missing = parseUc4Csv('Foo,Bar\n1,2\n')
assert.deepStrictEqual(missing.missingColumns, ['Image | Sku'])

console.log('ui.html CSV parsing: OK')
