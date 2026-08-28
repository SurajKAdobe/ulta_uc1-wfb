import React, { useEffect, useState } from 'react'
import { View, Flex, Text } from '@adobe/react-spectrum'
import Checkmark from '@spectrum-icons/workflow/Checkmark'
import Close from '@spectrum-icons/workflow/Close'
import { getBatchSummary } from '../../services/workflowService'

// ponytail: the real Workflow Builder graph has many more nodes than this (see
// execute-uc4-workflow/index.js) and their per-execution statuses ARE present
// in the poll response (status.outputs[i].outputs[j].{node_id,status}) — but
// node ids aren't exposed to the frontend (they're action-only env vars), and
// hardcoding specific ids here has already gone stale twice this session. So
// this shows 3 honest, always-true stages instead of a fake per-node graph:
// submit -> process (with real row counts from getBatchSummary) -> done. Wire
// up real per-node steps later if UC4_* node ids get mirrored into
// workflowConfig.js the way OUTPUT_PSD_NODE_ID already is.
const STEPS = [
  { key: 'submit', label: 'Submit batch', detail: 'Sending CSV rows to Workflow Builder' },
  { key: 'process', label: 'Process rows', detail: 'Compositing each row’s PSD' },
  { key: 'done', label: 'Getting ready for product resizing', detail: 'Loading the composited PSDs into the editor' }
]

function StepIcon ({ state }) {
  if (state === 'done') return <Checkmark size="XS" UNSAFE_style={{ color: '#fff' }} />
  if (state === 'error') return <Close size="XS" UNSAFE_style={{ color: '#fff' }} />
  if (state === 'active') return <span className="ulta-spinner" aria-hidden="true" />
  return null
}

// One second resolution is plenty for a batch that takes seconds-to-minutes —
// ties are real wall-clock (Date.now()) diffs, not a fabricated countdown.
function formatSeconds (ms) {
  return `${Math.max(0, Math.round(ms / 1000))}s`
}

export default function Uc4WorkflowStepper ({ batchId, status, running, failed, errorMessage, timestamps }) {
  const { start, submitDone, processDone } = timestamps || {}

  // Ticks once a second only while something is still timing (running) — no
  // interval at all once the batch finishes, so a completed/failed run's
  // stepper just shows its final frozen durations.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  const submitSeconds = start ? formatSeconds((submitDone || now) - start) : null
  const processSeconds = submitDone ? formatSeconds((processDone || now) - submitDone) : null

  const summary = getBatchSummary(status)
  const total = summary.total ?? null
  const completed = summary.completed ?? 0
  const failedCount = summary.failed ?? 0

  // Step state machine, driven entirely by real signals (batchId presence,
  // whether we're still polling, whether a terminal failure was reported) —
  // no fabricated delays.
  let states
  if (failed) {
    states = { submit: 'done', process: 'error', done: 'pending' }
  } else if (!running && !batchId) {
    states = { submit: 'pending', process: 'pending', done: 'pending' }
  } else if (running && !status) {
    states = { submit: 'active', process: 'pending', done: 'pending' }
  } else if (running) {
    states = { submit: 'done', process: 'active', done: 'pending' }
  } else {
    states = { submit: 'done', process: 'done', done: 'done' }
  }

  const processProgress = total ? Math.round(((completed + failedCount) / total) * 100) : (summary.progress ?? null)

  return (
    <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-250" UNSAFE_className="ulta-fade-in">
      <Text UNSAFE_style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>Running UC4 batch</Text>
      {batchId && (
        <Text UNSAFE_style={{ fontSize: 10, color: 'var(--spectrum-global-color-gray-600)', display: 'block', marginBottom: 12, wordBreak: 'break-all' }}>
          {batchId}
        </Text>
      )}

      <Flex direction="column">
        {STEPS.map((step, i) => {
          const state = states[step.key]
          const isLast = i === STEPS.length - 1
          return (
            <Flex key={step.key} direction="row" gap="size-150">
              <Flex direction="column" alignItems="center">
                <div className="ulta-stepper-icon" data-state={state}>
                  <StepIcon state={state} />
                </div>
                {!isLast && <div className="ulta-stepper-line" data-filled={state === 'done' || state === 'error' ? 'true' : 'false'} />}
              </Flex>
              <View paddingBottom={isLast ? 'size-0' : 'size-200'}>
                <Flex gap="size-100" alignItems="center">
                  <Text UNSAFE_style={{ fontSize: 12, fontWeight: 600, color: state === 'pending' ? 'var(--spectrum-global-color-gray-500)' : 'var(--spectrum-global-color-gray-900)' }}>
                    {step.label}
                  </Text>
                  {step.key === 'submit' && submitSeconds && <span className="ulta-pill">{submitSeconds}</span>}
                  {step.key === 'process' && processSeconds && <span className="ulta-pill">{processSeconds}</span>}
                </Flex>
                <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)', display: 'block' }}>
                  {step.key === 'process' && state === 'active' && total
                    ? `${completed + failedCount} of ${total} rows processed${failedCount ? ` (${failedCount} failed)` : ''}`
                    : step.detail}
                </Text>
                {step.key === 'process' && state === 'active' && (
                  <div className="ulta-progress-track" style={{ marginTop: 6, width: 160 }}>
                    {processProgress != null
                      ? <div className="ulta-progress-fill" style={{ width: `${processProgress}%` }} />
                      : <div className="ulta-progress-indeterminate" style={{ height: '100%' }} />}
                  </div>
                )}
              </View>
            </Flex>
          )
        })}
      </Flex>

      {failed && errorMessage && (
        <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12, display: 'block', marginTop: 8 }}>
          {errorMessage}
        </Text>
      )}
    </View>
  )
}
