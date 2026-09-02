# UC4 Personalization (Figma plugin)

A Figma-hosted front end for the *existing* UC4 backend — same
`execute-uc4-workflow` / `check-status` / `presign-upload` actions the web app
calls (see `../web-src/src/services/uc4WorkflowService.js`,
`workflowService.js`, `uploadService.js`, and `../actions/execute-uc4-workflow/
index.js`). Nothing server-side changes: this still uploads a template PSD +
background image to S3, submits a batch to Workflow Builder
(`run-workflow.adobe.io`), polls for completion, and surfaces the output
PSD(s) per row. The only thing that's different is *where* the UI lives —
inside Figma instead of the AEM/React app.

## Load it in Figma desktop

Figma menu → **Plugins → Development → Import plugin from manifest…** → pick
`figma-plugin/manifest.json`. No build step; it's plain JS/HTML, edit and
re-run.

## One-time setup: API Base URL

The plugin panel has a collapsed **API settings** section (auto-opens if
empty) — enter the deployed `aio app deploy` runtime host for this project,
e.g. `https://<namespace>-<app>.adobeioruntime.net`. It's saved via
`figma.clientStorage` so you only set it once per machine. The plugin calls
`{apiBaseUrl}/api/v1/web/ulta-wfb/{action}`, same path shape as
`web-src/src/config.json`.

`manifest.json`'s `networkAccess.allowedDomains` currently allows
`*.adobeioruntime.net` and `*.amazonaws.com` (Workflow Builder itself is only
ever called server-side by the action, never directly from the plugin). If
the deployed backend or S3 bucket lives on a different host, add it there.

## Using it

Same inputs as UC4's web form: a template PSD, a CSV (header row with an
SKU column — aliases `Image | Sku`, `sku`, `skus`, `sku id(s)` — and
optionally a Name column), and a background image + color. Hit **Run
Workflow**: it uploads the PSD/image, submits the batch, polls every 4s, and
lists each output:
- Every output **.psd** gets an **Open .psd** button (opens the presigned S3
  URL in your default browser via `figma.openExternal` — Figma can't open a
  `.psd` directly, same limitation the web app has).
- If the batch also produced a PNG rendition (scanned generically by mimeType
  — see `extractUc4OutputPngs` in `ui.html`, since UC4's PNG node id isn't
  pinned down anywhere the way the PSD one is — raw echoed per-SKU product
  images, named `image-0`/`image-1`/…, are filtered out; the button label
  shows the real WFB content name so it's obvious which rendition it is), it
  gets an **Insert into Figma** button that drops it onto the canvas as an
  image-filled rectangle. The fetch is routed through a new `fetch-asset`
  action (`../actions/fetch-asset/index.js`) rather than a direct browser
  fetch — WFB's output storage (Azure blob/CDN) doesn't send CORS headers, so
  the plugin iframe can't fetch it directly regardless of manifest.json's
  allowlist. That action relays the bytes into our own S3 bucket (same
  presign infra `presign-upload` uses) and hands back a URL there, rather
  than inlining bytes into its own JSON response — Adobe I/O Runtime web
  actions cap responses at ~1MB and real renditions have come back tens of
  MB. **This needs `aio app deploy` before Insert will work.**

## What's different from the web app

- Hosted inside Figma instead of the AEM shell — no other behavior change.
- No React/Spectrum — plain HTML/JS, since Figma plugin UI is one
  self-contained HTML string (no bundler wired up here).
- `test.js` only checks the CSV-parsing logic (copied into `ui.html`, since
  there's no module system to import it from) — the actual upload/execute/poll
  flow needs a live backend + Figma to exercise. Run: `node test.js`.

Skipped: if a given batch turns out to produce zero PNG nodes (only the raw
`.psd`), there's nothing to insert and only the **Open .psd** button shows.
Add a server-side PSD→PNG rendition step (e.g. via the existing
`psd-manifest`/`psd-composite` Photoshop API actions) if that ever needs to
be guaranteed rather than incidental.
