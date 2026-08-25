import React from 'react'
import { Grid, repeat } from '@adobe/react-spectrum'
import TemplateSlot from './TemplateSlot'

// Order matters — sent to ulta-datamerge-select-layer as a fixed-position array,
// one slot per SKU-count/dimension combo the node's "template" input can select.
export const ADDITIONAL_TEMPLATES = [
  { id: 'tpl-1sku-960x768', label: '1-SKU · 960×768' },
  { id: 'tpl-1sku-1500x896', label: '1-SKU · 1500×896' },
  { id: 'tpl-1sku-1500x1500', label: '1-SKU · 1500×1500' },
  { id: 'tpl-2sku-960x768', label: '2-SKU · 960×768' },
  { id: 'tpl-2sku-1500x896', label: '2-SKU · 1500×896' },
  { id: 'tpl-2sku-1500x1500', label: '2-SKU · 1500×1500' }
]

export default function TemplateGrid ({ slots, disabled, onSelect }) {
  return (
    <Grid columns={repeat('auto-fit', 'size-2000')} gap="size-150">
      {ADDITIONAL_TEMPLATES.map(t => (
        <TemplateSlot
          key={t.id}
          label={t.label}
          value={slots[t.id]?.value}
          isUploading={slots[t.id]?.isUploading}
          error={slots[t.id]?.error}
          disabled={disabled}
          onSelect={(file, validationError) => onSelect(t.id, file, validationError)}
        />
      ))}
    </Grid>
  )
}
