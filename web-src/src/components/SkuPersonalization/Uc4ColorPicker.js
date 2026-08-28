import React from 'react'
import { View, Flex, ColorPicker, ColorEditor, ColorField, parseColor } from '@adobe/react-spectrum'

// Node 4 (see execute-uc4-workflow/index.js) is a plain hex-color text field —
// this is the swatch+popover editor (ColorPicker/ColorEditor) plus a hex text
// field next to it so the value can also just be typed/pasted directly. No
// visible "Background color" label text here — the SectionHeading above
// (Uc4Workflow.js) already says that, a second one just repeats it.
export default function Uc4ColorPicker ({ value, onChange, disabled }) {
  let color
  try {
    color = parseColor(value || '#FFFFFF')
  } catch {
    color = parseColor('#FFFFFF')
  }

  return (
    <View borderWidth="thin" borderColor="gray-300" borderRadius="medium" padding="size-100">
      <Flex gap="size-150" alignItems="center">
        <ColorPicker aria-label="Background color" value={color} onChange={(c) => onChange(c.toString('hex'))} isDisabled={disabled} size="S">
          <ColorEditor />
        </ColorPicker>
        <ColorField
          aria-label="Background color hex"
          value={color}
          onChange={(c) => c && onChange(c.toString('hex'))}
          isDisabled={disabled}
          isQuiet
          flex={1}
        />
      </Flex>
    </View>
  )
}
