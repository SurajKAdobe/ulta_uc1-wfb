import React, { useState } from 'react'
import { Button, Text } from '@adobe/react-spectrum'
import Copy from '@spectrum-icons/workflow/Copy'
import Checkmark from '@spectrum-icons/workflow/Checkmark'

export default function CopyButton ({ getText, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy () {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable/denied — nothing sensitive enough to warrant a fallback UI
    }
  }

  return (
    <Button variant="secondary" style="outline" onPress={handleCopy} UNSAFE_className="ulta-copy-btn">
      {copied ? <Checkmark size="S" /> : <Copy size="S" />}
      <Text>{copied ? 'Copied' : label}</Text>
    </Button>
  )
}
