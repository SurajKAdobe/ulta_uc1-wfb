const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const actionPath = path.join(__dirname, 'index.js')
const params = {
  psdPresignedUrl: 'https://storage.example/input.psd',
  IMS_OAUTH_S2S_CLIENT_ID: 'test-client',
  IMS_OAUTH_S2S_CLIENT_SECRET: 'test-secret',
  IMS_OAUTH_S2S_SCOPES: 'test-scope'
}

function loadAction ({ failStage, storageError, uploadStatus = 200 } = {}) {
  const jobs = []
  const writes = []
  const errors = []
  const mocks = {
    '@adobe/aio-sdk': { Core: { Logger: () => ({ info: () => {}, error: (message) => errors.push(message) }) } },
    '../libs/storage': {
      getUploadUrls: async (key) => {
        if (storageError) throw new Error('Storage unavailable')
        return {
          putUrl: `https://storage.example/write/${key}`,
          getUrl: `https://storage.example/read/${key}`
        }
      }
    },
    '../libs/photoshopV2': { runJob: async (endpoint, body, credentials, timeout) => {
      jobs.push({ endpoint, body, credentials, timeout })
      if (endpoint === failStage) throw new Error('Photoshop job failed')
      return { jobId: `job-${jobs.length}`, status: 'succeeded' }
    } }
  }
  const action = new Module(actionPath, module)
  action.filename = actionPath
  action.paths = module.paths
  action.fetch = async (url, options) => {
    assert.equal(jobs.length, 0)
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers['content-type'], 'application/octet-stream')
    assert.equal(options.headers.authorization, undefined)
    writes.push({ key: url.replace('https://storage.example/write/', ''), bytes: options.body })
    return { ok: uploadStatus >= 200 && uploadStatus < 300, status: uploadStatus }
  }
  action.require = (name) => mocks[name] || Module.prototype.require.call(action, name)
  action._compile(`const fetch = module.fetch\n${fs.readFileSync(actionPath, 'utf8')}`, actionPath)
  return { main: action.exports.main, jobs, writes, errors }
}

test('runs bundled ATN on the saved PSD before rendering PSD and PNG', async () => {
  const { main, jobs, writes } = loadAction()
  const response = await main(params)
  assert.equal(response.statusCode, 200)
  assert.equal(writes.length, 1)
  const bundledAction = fs.readFileSync(path.resolve(__dirname, '../../photoshop-action/Harmonization_Process V2.atn'))
  assert.deepEqual(writes[0].bytes, bundledAction)
  assert.match(writes[0].key, /^defaults\/photoshop-actions\/[a-f0-9]{64}\.atn$/)
  assert.equal(jobs.length, 2)
  assert.equal(jobs[0].endpoint, '/v2/execute-actions')
  assert.deepEqual(jobs[0].body.image, { source: { url: params.psdPresignedUrl } })
  assert.deepEqual(jobs[0].body.options.actions, [{
    actionName: 'Harmonize Products', source: { url: `https://storage.example/read/${writes[0].key}` }
  }])
  assert.equal(jobs[0].body.outputs[0].mediaType, 'image/vnd.adobe.photoshop')
  assert.equal(jobs[1].endpoint, '/v2/create-composite')
  assert.equal(jobs[1].body.image.source.url, jobs[0].body.outputs[0].destination.url.replace('/write/', '/read/'))
  assert.deepEqual(jobs[1].body.outputs.map((output) => output.mediaType), ['image/vnd.adobe.photoshop', 'image/png'])
  assert.equal(jobs[1].body.outputs[1].cropMode, 'document_bounds')
  assert.equal(response.body.harmonizedUrl, jobs[1].body.outputs[1].destination.url.replace('/write/', '/read/'))
  assert.equal(response.body.harmonizedPsdUrl, jobs[1].body.outputs[0].destination.url.replace('/write/', '/read/'))
  assert.ok(response.body.harmonizedPsdUrl.endsWith(response.body.harmonizedPsdKey))
  assert.ok(response.body.harmonizedUrl.endsWith(response.body.harmonizedPngKey))
  assert.equal(response.body.actionJobId, 'job-1')
  assert.equal(response.body.jobId, 'job-2')
  assert.equal(jobs[0].credentials, params)
  assert.ok(jobs[0].timeout > 0 && jobs[0].timeout <= 250000)
  assert.ok(jobs[1].timeout > 0 && jobs[1].timeout <= jobs[0].timeout)
})

test('requires PSD and Photoshop credentials before accessing storage', async () => {
  for (const field of ['psdPresignedUrl', 'IMS_OAUTH_S2S_CLIENT_ID', 'IMS_OAUTH_S2S_CLIENT_SECRET', 'IMS_OAUTH_S2S_SCOPES']) {
    const { main, jobs, writes } = loadAction()
    const response = await main({ ...params, [field]: undefined })
    assert.equal(response.statusCode, 400)
    assert.equal(jobs.length, 0)
    assert.equal(writes.length, 0)
  }
})

test('action failure prevents rendition submission', async () => {
  const { main, jobs } = loadAction({ failStage: '/v2/execute-actions' })
  const response = await main(params)
  assert.equal(response.statusCode, 500)
  assert.equal(jobs.length, 1)
  assert.equal(response.body.ok, false)
  assert.equal(response.body.harmonizedUrl, undefined)
})

test('rendition failure does not return incomplete artifacts', async () => {
  const { main, jobs } = loadAction({ failStage: '/v2/create-composite' })
  const response = await main(params)
  assert.equal(response.statusCode, 500)
  assert.equal(jobs.length, 2)
  assert.equal(response.body.harmonizedPsdUrl, undefined)
})

test('storage failure prevents Photoshop submission', async () => {
  const { main, jobs } = loadAction({ storageError: true })
  const response = await main(params)
  assert.equal(response.statusCode, 500)
  assert.match(response.body.error.message, /Runtime storage credentials/)
  assert.equal(jobs.length, 0)
})

test('rejected signed ATN upload prevents Photoshop submission', async () => {
  const { main, jobs, writes, errors } = loadAction({ uploadStatus: 403 })
  const response = await main(params)
  assert.equal(response.statusCode, 500)
  assert.equal(writes.length, 1)
  assert.match(response.body.error.message, /action storage/)
  assert.ok(errors.includes('Photoshop action upload failed: HTTP 403'))
  assert.equal(jobs.length, 0)
})

test('OPTIONS preflight needs no credentials', async () => {
  const { main, jobs, writes } = loadAction()
  assert.equal((await main({ __ow_method: 'options' })).statusCode, 204)
  assert.equal(jobs.length, 0)
  assert.equal(writes.length, 0)
})