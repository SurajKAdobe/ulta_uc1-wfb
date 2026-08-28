import React, { useEffect, useState } from 'react'
import { Flex, Text, ActionButton } from '@adobe/react-spectrum'
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft'
import ChevronRight from '@spectrum-icons/workflow/ChevronRight'

const PAGE_SIZE = 8
const DEFAULT_COL_WIDTH = 160
const MIN_COL_WIDTH = 60

// Resizable, paginated CSV preview table — pulled out of CsvUpload.js so UC1's
// inline preview and UC4's full-view popup (Uc4CsvUpload.js) render the exact
// same table instead of two hand-rolled copies.
// resetKey: pass something that changes when a new file is loaded (e.g.
// `${fileName}-${size}`) so paging/column widths don't carry over from the
// previous file.
export default function CsvPreviewTable ({ headers, rows, resetKey, maxHeight = 220 }) {
  const [colWidths, setColWidths] = useState([])
  const [page, setPage] = useState(0)

  useEffect(() => { setPage(0) }, [resetKey])

  function startResize (index, e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = colWidths[index] ?? DEFAULT_COL_WIDTH
    function onMove (moveEvent) {
      const width = Math.max(MIN_COL_WIDTH, startWidth + moveEvent.clientX - startX)
      setColWidths(prev => {
        const next = [...prev]
        next[index] = width
        return next
      })
    }
    function onUp () {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const totalRows = rows?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageRows = rows?.slice(pageStart, pageStart + PAGE_SIZE) ?? []

  return (
    <>
      <div className="ulta-preview-card">
        <div className="ulta-preview-scroll" style={{ maxHeight }}>
          <table className="ulta-table" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 40 }} />
              {headers.map((h, i) => <col key={i} style={{ width: colWidths[i] ?? DEFAULT_COL_WIDTH }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="ulta-table-index">#</th>
                {headers.map((h, i) => (
                  <th key={i}>
                    {h}
                    <span className="ulta-col-resizer" onMouseDown={(e) => startResize(i, e)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={pageStart + ri} className="ulta-table-row" style={{ animationDelay: `${ri * 35}ms` }}>
                  <td className="ulta-table-index">{pageStart + ri + 1}</td>
                  {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalRows > PAGE_SIZE && (
        <Flex justifyContent="space-between" alignItems="center" marginTop="size-100">
          <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
            Rows {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, totalRows)} of {totalRows}
          </Text>
          <Flex gap="size-50" alignItems="center">
            <ActionButton isQuiet isDisabled={currentPage === 0} onPress={() => setPage(p => p - 1)} aria-label="Previous page">
              <ChevronLeft size="S" />
            </ActionButton>
            <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
              Page {currentPage + 1} of {totalPages}
            </Text>
            <ActionButton isQuiet isDisabled={currentPage >= totalPages - 1} onPress={() => setPage(p => p + 1)} aria-label="Next page">
              <ChevronRight size="S" />
            </ActionButton>
          </Flex>
        </Flex>
      )}
    </>
  )
}
