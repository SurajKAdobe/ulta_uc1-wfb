// Display-only. The actual workflow ID and credentials used to call Workflow Builder
// live server-side in the execute-workflow action — never here.
export const WORKFLOW_DISPLAY_NAME = 'Ulta Beauty Product Image Workflow'

// The two per-row output nodes we visualize after a batch completes — everything
// else in a status response's outputs[] (SKU/filename/background/template echoes,
// the static PSD template passthroughs) is noise we don't render.
export const OUTPUT_PSD_NODE_ID = 'node_1785246604490_y6x0aoszp_15_qje52f'
export const OUTPUT_PNG_NODE_ID = 'node_1786459217842_jgd5pehin_17_vwzopc'

// UC4 batch workflow — output PSD node id(s) to pull from a completed batch's
// status response (see extractUc4OutputPsds in services/uc4WorkflowService.js).
// TODO(uc4-workflow): placeholder until the real Workflow Builder graph is
// finalized — fill in once known.
export const UC4_OUTPUT_PSD_NODE_IDS = []
