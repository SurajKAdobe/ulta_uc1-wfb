import React, { useState } from 'react'
import { View, Flex, Text, Button, ProgressCircle } from '@adobe/react-spectrum'
import ChevronDown from '@spectrum-icons/workflow/ChevronDown'
import ChevronUp from '@spectrum-icons/workflow/ChevronUp'
import CopyButton from '../CopyButton'
import { previewWorkflowPayload } from '../../services/workflowService'

const REDACTED = '<redacted — held server-side only>'

function buildCurl ({ url, body }) {
  const headers = [
    'Content-Type: application/json',
    'Accept: application/json',
    'api-version: 1.0',
    `Authorization: Bearer ${REDACTED}`,
    `x-gw-ims-org-id: ${REDACTED}`,
    `x-gw-ims-user-id: ${REDACTED}`,
    `x-api-key: ${REDACTED}`
  ]

  const headerLines = headers.map(h => `  -H '${h}' \\\n`).join('')
  const bodyJson = JSON.stringify(body, null, 2)

  return `curl -i -X POST \\\n  '${url}' \\\n${headerLines}  -d '${bodyJson}'`
}

// Preview-only — never sends the request, and the secret headers execute-workflow
// actually uses are redacted here since this component only sees non-secret data.
export default function CurlPreview ({ rows, templatePresignedUrl, additionalTemplatePresignedUrls, isReady }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [curl, setCurl] = useState(null)

  async function handleToggle () {
    const next = !expanded
    setExpanded(next)
    if (!next || !isReady) return

    setLoading(true)
    setError(null)
    try {
      const result = await previewWorkflowPayload({ rows, templatePresignedUrl, additionalTemplatePresignedUrls })
      setCurl(buildCurl(result))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View>
      <Flex gap="size-100" alignItems="center">
        <Button variant="secondary" style="outline" isDisabled={!isReady} onPress={handleToggle}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
          <Text>Preview Request</Text>
        </Button>
        {expanded && curl && <CopyButton label="Copy curl" getText={() => curl} />}
      </Flex>

      {!isReady && (
        <Text UNSAFE_style={{ fontSize: 11, color: 'var(--spectrum-global-color-gray-600)', display: 'block', marginTop: 6 }}>
          Upload all inputs to preview the request.
        </Text>
      )}

      {expanded && isReady && (
        <View marginTop="size-100" UNSAFE_className="ulta-fade-in">
          {loading && <ProgressCircle aria-label="Building preview" isIndeterminate size="S" />}
          {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
          {curl && !loading && (
            <div style={{ maxHeight: 220, overflow: 'auto', borderRadius: 4, border: '1px solid var(--spectrum-global-color-gray-200)' }}>
              <pre style={{ margin: 0, padding: 10, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{curl}</pre>
            </div>
          )}
        </View>
      )}
    </View>
  )
}
