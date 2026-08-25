import React, { useEffect, useState } from 'react'
import { Flex, Text, StatusLight, DialogContainer } from '@adobe/react-spectrum'
import { listBatches } from '../services/workflowService'
import BatchAssetsDialog from './BatchHistory/BatchAssetsDialog'

const STATUS_VARIANT = {
  completed: 'positive',
  running: 'info',
  pending: 'info',
  failed: 'negative',
  cancelled: 'neutral',
  canceled: 'neutral'
}

function formatDate (iso) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

// Quick-glance strip of the last 3 batches so the user doesn't have to open
// the full History dialog just to see what ran last. Clicking a row opens
// the same asset gallery BatchHistory uses.
export default function RecentBatches () {
  const [batches, setBatches] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    listBatches().then((data) => setBatches((data?.batches || []).slice(0, 3))).catch(() => {})
  }, [])

  if (batches.length === 0) return null

  return (
    <>
      <Flex direction="column" gap="size-75" UNSAFE_className="ulta-preview-card ulta-fade-in" UNSAFE_style={{ padding: 12 }}>
        <Text UNSAFE_style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--spectrum-global-color-gray-700)' }}>
          RECENT BATCHES
        </Text>
        {batches.map((b) => (
          <Flex
            key={b.batchId}
            justifyContent="space-between"
            alignItems="center"
            gap="size-150"
            wrap
            UNSAFE_style={{ cursor: 'pointer', padding: '4px 0' }}
            onClick={() => setSelected(b)}
          >
            <StatusLight variant={STATUS_VARIANT[b.status] || 'neutral'} UNSAFE_style={{ margin: 0 }}>
              {b.jobName || b.batchId}
            </StatusLight>
            <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)', whiteSpace: 'nowrap' }}>
              {b.assets?.completed ?? 0}/{b.assets?.total ?? 0} · {formatDate(b.createdAt)}
            </Text>
          </Flex>
        ))}
      </Flex>

      <DialogContainer onDismiss={() => setSelected(null)} isDismissable>
        {selected && <BatchAssetsDialog batch={selected} />}
      </DialogContainer>
    </>
  )
}
