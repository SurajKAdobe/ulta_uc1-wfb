// One-off seed script — uploads the fixed default template/background assets
// this app expects to already exist in Adobe I/O Files storage (the UC1
// primary + 6 additional PSD templates, and the UC4 background image).
// Read-only, re-presigned-on-demand from there after this (see
// actions/default-additional-templates, actions/refresh-presign, and
// services/uploadService.js's getDefaultTemplate).
//
// Run with: node scripts/seed-default-assets.js [action-base-url]
// Defaults to the local `aio app dev` server; pass a deployed base URL
// (https://<namespace>.adobeioruntime.net/api/v1/web/ulta-wfb) to seed a
// deployed namespace instead.
//
// Bytes go straight from here to storage via a presigned PUT — they never
// pass through the seed-default-assets action itself, since these PSDs run up
// to ~16MB, past Adobe I/O Runtime's web action payload limit. The action
// only ever mints a write URL for one of a fixed, whitelisted set of keys.
const fs = require('fs')
const path = require('path')

const BASE_URL = process.argv[2] || 'https://localhost:9080/api/v1/web/ulta-wfb'
const PSDS_DIR = path.join(__dirname, '..', 'psds')
const ASSETS_DIR = path.join(__dirname, '..', 'web-src', 'src', 'assets')

// Keys/filenames must match actions/seed-default-assets/index.js's ALLOWED_KEYS.
const ASSETS = [
  { key: 'defaults/primary-template/bg_change.psd', file: path.join(PSDS_DIR, 'bg_change.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-1sku-960x768.psd', file: path.join(PSDS_DIR, 'UC1 - Promo Card - 1 SKU.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-1sku-1500x896.psd', file: path.join(PSDS_DIR, 'UC1-Promo-Card-1-SKU-4x_FS_1500x896.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-1sku-1500x1500.psd', file: path.join(PSDS_DIR, 'UC1-Promo-Card-1-SKU-4x_FS_1500x1500.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-2sku-960x768.psd', file: path.join(PSDS_DIR, 'UC1 - Promo Card - 2 SKU.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-2sku-1500x896.psd', file: path.join(PSDS_DIR, 'UC1-Promo-Card-2-SKU-4x_1500x896.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/additional-templates/tpl-2sku-1500x1500.psd', file: path.join(PSDS_DIR, 'UC1-Promo-Card-2-SKU-4x_1500x1500.psd'), contentType: 'application/octet-stream' },
  { key: 'defaults/uc4-background/bg.jpg', file: path.join(ASSETS_DIR, 'bg.jpg'), contentType: 'image/jpeg' }
]

async function main () {
  // aio app dev's local cert is self-signed.
  if (BASE_URL.startsWith('https://localhost')) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  for (const { key, file, contentType } of ASSETS) {
    const buffer = fs.readFileSync(file)
    console.log(`${key} (${buffer.length} bytes) ...`)

    const presignRes = await fetch(`${BASE_URL}/seed-default-assets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key })
    })
    const presignData = await presignRes.json().catch(() => null)
    if (!presignRes.ok || !presignData?.ok) {
      throw new Error(`presign failed for ${key}: ${presignData?.error?.message || presignRes.status}`)
    }

    const putRes = await fetch(presignData.putUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType, 'x-ms-blob-type': 'BlockBlob' },
      body: buffer
    })
    if (!putRes.ok) {
      throw new Error(`upload failed for ${key} (${putRes.status}): ${await putRes.text()}`)
    }
    console.log(`  uploaded`)
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
