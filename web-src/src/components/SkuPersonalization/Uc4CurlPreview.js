import React, { useState } from 'react'
import { ActionButton, DialogTrigger, Dialog, Heading, Divider, Content, View, Text, ProgressCircle, ButtonGroup, Button } from '@adobe/react-spectrum'
import Code from '@spectrum-icons/workflow/Code'
import CopyButton from '../CopyButton'
import { previewUc4Workflow } from '../../services/uc4WorkflowService'

const REDACTED = '<redacted — held server-side only>'

// Same redacted-headers approach as CurlPreview.js (UC1) — this component only
// ever sees non-secret data, so the real auth headers execute-uc4-workflow
// actually sends can't leak through here even by accident.
function buildCurl ({ url, body }) {
  const headers = [
    'Content-Type: application/json',
    'Accept: application/json',
    `Authorization: Bearer ${REDACTED}`,
    `x-gw-ims-org-id: ${REDACTED}`,
    `x-gw-ims-user-id: ${REDACTED}`,
    `x-api-key: ${REDACTED}`
  ]
  const headerLines = headers.map((h) => `  -H '${h}' \\\n`).join('')
  const bodyJson = JSON.stringify(body, null, 2)
  return `curl -i -X POST \\\n  '${url}' \\\n${headerLines}  -d '${bodyJson}'`
}

// A dialog (not UC1 CurlPreview's inline expand) — keeps the narrow sidebar
// from having to make room for a big JSON blob inline.
export default function Uc4CurlPreview ({ isReady, rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [curl, setCurl] = useState(null)

  async function handleOpenChange (isOpen) {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    try {
      const result = await previewUc4Workflow({ rows, skuColumnIndex, backgroundImagePresignedUrl, templatePsdPresignedUrl, colorHex })
      setCurl(buildCurl(result))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogTrigger type="modal" onOpenChange={handleOpenChange}>
      <ActionButton isQuiet isDisabled={!isReady} aria-label="Preview cURL">
        <Code size="S" />
        <Text UNSAFE_style={{ fontSize: 11 }}>Preview cURL</Text>
      </ActionButton>
      {(close) => (
        <Dialog size="L">
          <Heading>UC4 Workflow Request Preview</Heading>
          <Divider />
          <Content>
            {loading && <ProgressCircle aria-label="Building preview" isIndeterminate size="S" />}
            {error && <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-600)', fontSize: 12 }}>{error}</Text>}
            {curl && !loading && (
              <>
                <View marginBottom="size-100"><CopyButton label="Copy curl" getText={() => curl} /></View>
                <div style={{ maxHeight: 420, overflow: 'auto', borderRadius: 4, border: '1px solid var(--spectrum-global-color-gray-200)' }}>
                  <pre style={{ margin: 0, padding: 10, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{curl}</pre>
                </div>
              </>
            )}
          </Content>
          <ButtonGroup>
            <Button variant="secondary" onPress={close}>Close</Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  )
}
