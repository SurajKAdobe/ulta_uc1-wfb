import React, { useEffect, useState } from 'react'
import { Dialog, Heading, Divider, Content, Text, ProgressCircle, Flex, ActionButton } from '@adobe/react-spectrum'
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft'
import { checkWorkflowStatus, extractOutputAssets } from '../../services/workflowService'
import OutputGallery from '../OutputGallery/OutputGallery'

// Fetches a single batch's status (format=preview) and renders its output
// assets. Shared by BatchHistory's row-click detail view and the header's
// recent-batches strip, so both open the same gallery for a given batchId.
export default function BatchAssetsDialog ({ batch, onBack }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [outputExecutions, setOutputExecutions] = useState([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOutputExecutions([])
    checkWorkflowStatus(batch.batchId)
      .then((status) => { if (!cancelled) setOutputExecutions(extractOutputAssets(status)) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [batch.batchId])

  return (
    <Dialog size="L">
      <Heading>
        <Flex alignItems="center" gap="size-100">
          {onBack && (
            <ActionButton isQuiet aria-label="Back to batch list" onPress={onBack}>
              <ChevronLeft size="S" />
            </ActionButton>
          )}
          <Text>{batch.jobName || batch.batchId}</Text>
        </Flex>
      </Heading>
      <Divider />
      <Content>
        {loading && <ProgressCircle isIndeterminate aria-label="Loading assets" size="S" />}
        {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
        {!loading && !error && outputExecutions.length === 0 && <Text>No output assets for this batch.</Text>}
        {!loading && outputExecutions.length > 0 && <OutputGallery executions={outputExecutions} />}
      </Content>
    </Dialog>
  )
}
