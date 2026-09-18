// One input group per CSV row. The 6 additional templates and the primary
// (Merge Photoshop data) template are identical on every row — only the 4
// per-row text fields (sku, filename, background, templateSize) change.
function buildWorkflowInputs ({
  rows,
  templatePresignedUrl,
  additionalTemplatePresignedUrls,
  templateNodeId,
  additionalTemplateNodeIds,
  skuNodeId,
  filenameNodeId,
  backgroundNodeId,
  templateSizeNodeId
}) {
  return rows.map(row => [
    ...additionalTemplateNodeIds.map((nodeId, i) => ({
      node_id: nodeId,
      content: { presignedUrl: additionalTemplatePresignedUrls[i], storageType: 'ADOBE_IO_FILES' }
    })),
    { node_id: skuNodeId, content: row.sku },
    { node_id: filenameNodeId, content: row.filename },
    { node_id: backgroundNodeId, content: row.background },
    { node_id: templateSizeNodeId, content: row.templateSize },
    {
      node_id: templateNodeId,
      template: { presignedUrl: templatePresignedUrl, storageType: 'ADOBE_IO_FILES' }
    }
  ])
}

module.exports = { buildWorkflowInputs }
