function json (statusCode, body) {
  return {
    statusCode,
    // Deployed Adobe I/O Runtime adds Access-Control-Allow-Origin to a web action's
    // actual response automatically; `aio app dev`'s local emulator doesn't, so the
    // browser blocks reading the response as a CORS error even once the preflight
    // (see withCors below) succeeds. Setting it here matches prod behavior locally.
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body
  }
}

const ok = (body) => json(200, body)
const badRequest = (message) => json(400, { ok: false, error: { code: 'BAD_REQUEST', message } })
const serverError = (message) => json(500, { ok: false, error: { code: 'INTERNAL_ERROR', message } })

// Deployed Adobe I/O Runtime answers a web action's CORS preflight itself, before
// user code ever runs — but `aio app dev`'s local emulator has no such layer, so an
// OPTIONS request falls straight into main() and fails its own param validation
// before any CORS header is set. Wrapping main() here short-circuits OPTIONS with
// the headers a browser preflight needs; in production this branch never runs, so
// it's a local-dev-only fix.
const withCors = (main) => (params) => {
  if (params.__ow_method === 'options') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, authorization'
      }
    }
  }
  return main(params)
}

module.exports = { ok, badRequest, serverError, withCors }
