// One-off seed script — uploads web-src/src/assets/bg.jpg to a fixed S3 key
// (same "upload once, re-presign on demand" pattern as UC1's default template —
// see actions/default-additional-templates and services/uploadService.js
// getDefaultTemplate). Run with: node scripts/upload-uc4-background.js
//
// actions/execute-uc4-workflow/index.js always mints a fresh presigned GET for
// this same fixed key at request time (see getFreshReadUrl in actions/libs/s3.js)
// rather than hardcoding an actual presigned URL, since those expire.
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { getUploadUrls } = require('../actions/libs/s3')

const ASSET_PATH = path.join(__dirname, '..', 'web-src', 'src', 'assets', 'bg.jpg')
const S3_KEY = 'defaults/uc4-background/bg.jpg'

async function main () {
  const env = {
    S3_PRESIGN_URL: process.env.S3_PRESIGN_URL,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION
  }
  for (const [key, value] of Object.entries(env)) {
    if (!value) throw new Error(`Missing ${key} in .env`)
  }

  const buffer = fs.readFileSync(ASSET_PATH)
  console.log(`Uploading ${ASSET_PATH} (${buffer.length} bytes) to s3://${env.S3_BUCKET}/${S3_KEY} ...`)

  const { putUrl, getUrl } = await getUploadUrls(env, S3_KEY)
  const putResponse = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: buffer
  })
  if (!putResponse.ok) {
    throw new Error(`Upload failed (${putResponse.status}): ${await putResponse.text()}`)
  }

  console.log('Uploaded. Fixed S3 key:', S3_KEY)
  console.log('Fresh presigned GET (for reference only, expires — the action re-mints its own):')
  console.log(getUrl)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
