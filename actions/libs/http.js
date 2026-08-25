function json (statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body
  }
}

const ok = (body) => json(200, body)
const badRequest = (message) => json(400, { ok: false, error: { code: 'BAD_REQUEST', message } })
const serverError = (message) => json(500, { ok: false, error: { code: 'INTERNAL_ERROR', message } })

module.exports = { ok, badRequest, serverError }
