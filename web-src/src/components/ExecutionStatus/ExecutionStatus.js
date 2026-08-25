import React from 'react'
import { Flex, Text, StatusLight, Button } from '@adobe/react-spectrum'
import CopyButton from '../CopyButton'
import OutputGallery from '../OutputGallery/OutputGallery'
import { extractOutputAssets, getBatchSummary } from '../../services/workflowService'

const VARIANT_BY_STATE = {
  ready: 'neutral',
  running: 'info',
  success: 'positive',
  error: 'negative'
}

const LABEL_BY_STATE = {
  ready: 'Ready',
  running: 'Running',
  success: 'Completed',
  error: 'Execution Failed'
}

function formatDuration (ms) {
  if (ms == null || !Number.isFinite(ms)) return null
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function StatFigure ({ label, value }) {
  return (
    <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>
      {label} <b UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-900)' }}>{value ?? '—'}</b>
    </Text>
  )
}

export default function ExecutionStatus ({ state, csvRecordCount, csvRowLabels, statusResult, executionsDetail, errorMessage, durationMs, onCancel, isCancelling }) {
  const { total, completed, failed, progress } = getBatchSummary(statusResult)
  const submittedTotal = total ?? csvRecordCount
  const outputExecutions = extractOutputAssets(statusResult)
  const duration = formatDuration(durationMs)

  const technicalDetails = [
    errorMessage,
    statusResult?.jobName ? `Job: ${statusResult.jobName}` : null,
    statusResult?.batchId ? `Batch: ${statusResult.batchId}` : null,
    statusResult ? `Status:\n${JSON.stringify(statusResult, null, 2)}` : null,
    executionsDetail ? `Executions:\n${JSON.stringify(executionsDetail, null, 2)}` : null
  ].filter(Boolean).join('\n\n')

  return (
    <Flex direction="column" gap="size-150" UNSAFE_className="ulta-fade-in" flex={1} minHeight={0}>
      <StatusLight variant={VARIANT_BY_STATE[state]}>{LABEL_BY_STATE[state]}</StatusLight>

      <Flex direction="column" gap="size-75">
        {state === 'ready' && (
          <Flex justifyContent="space-between"><Text>CSV Records</Text><Text>{csvRecordCount ?? '—'}</Text></Flex>
        )}

        {state === 'running' && (
          <Flex direction="column" gap="size-100">
            <Flex justifyContent="space-between" alignItems="center">
              <Text>Workflow execution is in progress...</Text>
              {progress != null && <Text UNSAFE_style={{ fontSize: 11, fontWeight: 600 }}>{progress}%</Text>}
            </Flex>
            {progress != null
              ? (
                <div className="ulta-progress-track">
                  <div className="ulta-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                )
              : <div className="ulta-progress-track ulta-progress-indeterminate" aria-hidden="true" />}
            <Flex gap="size-200" alignItems="center">
              {duration && <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)' }}>Elapsed: {duration}</Text>}
              {onCancel && (
                <Button variant="negative" style="outline" isPending={isCancelling} onPress={onCancel}>
                  Cancel
                </Button>
              )}
            </Flex>
          </Flex>
        )}

        {state === 'success' && (
          <>
            <Flex gap="size-200" wrap>
              <StatFigure label="Submitted" value={submittedTotal} />
              <StatFigure label="Completed" value={completed} />
              <StatFigure label="Failed" value={failed ?? 0} />
              {duration && <StatFigure label="Time taken" value={duration} />}
            </Flex>
            <OutputGallery executions={outputExecutions} rowLabels={csvRowLabels} />
          </>
        )}

        {state === 'error' && (
          <>
            <Text>The workflow could not be executed.</Text>
            <Flex gap="size-100" alignItems="center">
              <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-700)' }}>
                {errorMessage || 'No further details available.'}
              </Text>
              <CopyButton label="Copy details" getText={() => technicalDetails} />
            </Flex>
          </>
        )}
      </Flex>
    </Flex>
  )
}
