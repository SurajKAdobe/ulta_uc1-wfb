import React from 'react'
import { View, Text, Heading } from '@adobe/react-spectrum'

// The Execute button itself now lives in the top bar (Header) — this panel just
// explains what's blocking it, so the reason is visible without hunting for it.
export default function WorkflowInfo ({ workflowName, missingReasons }) {
  return (
    <View UNSAFE_className="ulta-fade-in">
      <Heading level={3} margin={0}>Workflow</Heading>
      <Text>{workflowName}</Text>

      {missingReasons.length > 0 && (
        <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-600)', display: 'block', marginTop: 8 }}>
          {missingReasons.join(' ')}
        </Text>
      )}
    </View>
  )
}
