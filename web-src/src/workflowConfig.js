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
// The merge-PSD node (mimeType image/vnd.adobe.photoshop, name "result") —
// not node_1787835824857_zfxuosalx_1_6c8vo6, which is just the input
// template echoed back in outputs[], not the merged result.
export const UC4_OUTPUT_PSD_NODE_IDS = ['node_1787843874081_zpybqfouc_8_603n3t']

// UC2B banner generation — output node id(s) to pull the generated banner(s)
// from a completed batch's status response (see extractUc2bOutputs in
// services/uc2bWorkflowService.js). Empty until a real run's status response
// reveals which node(s) actually hold the finished banner — the request that
// established UC2B_INPUT_CSV_NODE_ID/UC2B_INPUT_TEMPLATE_NODE_ID (see .env)
// only showed the request shape, not a completed execution's outputs.
// extractUc2bOutputs falls back to listing every non-input asset in the
// response when this is empty, so the feature is usable (and the real id
// identifiable) before this is filled in.
export const UC2B_OUTPUT_NODE_IDS = []
