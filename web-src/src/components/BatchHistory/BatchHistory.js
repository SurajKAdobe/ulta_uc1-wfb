import React, { useCallback, useState } from 'react'
import { ActionButton, DialogContainer, Dialog, Heading, Divider, Content, Text, Button, ProgressCircle, Flex } from '@adobe/react-spectrum'
import HistoryIcon from '@spectrum-icons/workflow/History'
import { listBatches, cancelBatch } from '../../services/workflowService'
import BatchAssetsDialog from './BatchAssetsDialog'

const CANCELLABLE_STATES = ['pending', 'running']

function formatDate (iso) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

// GET /batches history + POST /batch/{id}/cancel, both surfaced in one dialog —
// opened on demand rather than polled, since batch history isn't time-sensitive
// the way an in-flight execution's status is.
export default function BatchHistory () {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [batches, setBatches] = useState([])
  const [cancelingId, setCancelingId] = useState(null)
  const [selectedBatch, setSelectedBatch] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listBatches()
      setBatches(data?.batches || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleOpen () {
    setIsOpen(true)
    setSelectedBatch(null)
    load()
  }

  async function handleCancel (batchId) {
    setCancelingId(batchId)
    try {
      await cancelBatch(batchId)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <>
      <ActionButton isQuiet onPress={handleOpen} aria-label="Batch history">
        <HistoryIcon size="S" />
        <Text>History</Text>
      </ActionButton>

      <DialogContainer onDismiss={() => setIsOpen(false)} isDismissable>
        {isOpen && selectedBatch && (
          <BatchAssetsDialog batch={selectedBatch} onBack={() => setSelectedBatch(null)} />
        )}

        {isOpen && !selectedBatch && (
          <Dialog size="L">
            <Heading>Batch History</Heading>
            <Divider />
            <Content>
              {loading && <ProgressCircle isIndeterminate aria-label="Loading batches" size="S" />}
              {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
              {!loading && !error && batches.length === 0 && <Text>No batches found.</Text>}

              {!loading && batches.length > 0 && (
                <table className="ulta-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Assets</th>
                      <th>Submitted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, i) => (
                      <tr
                        key={b.batchId}
                        className="ulta-table-row"
                        style={{ animationDelay: `${i * 30}ms`, cursor: 'pointer' }}
                        onClick={() => setSelectedBatch(b)}
                      >
                        <td title={b.batchId}>{b.jobName || b.batchId}</td>
                        <td>{b.status}</td>
                        <td>{b.assets?.completed ?? 0}/{b.assets?.total ?? 0}</td>
                        <td>{formatDate(b.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {CANCELLABLE_STATES.includes(b.status) && (
                            <Button
                              variant="negative"
                              style="outline"
                              isPending={cancelingId === b.batchId}
                              onPress={() => handleCancel(b.batchId)}
                            >
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <Flex justifyContent="end" marginTop="size-200">
                <Button variant="secondary" style="outline" onPress={load} isDisabled={loading}>Refresh</Button>
              </Flex>
            </Content>
          </Dialog>
        )}
      </DialogContainer>
    </>
  )
}
