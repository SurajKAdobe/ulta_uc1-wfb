import config from './config.json'

const PACKAGE_NAME = 'ulta-wfb'

export async function callAction (name, payload = {}) {
  const url = config[`${PACKAGE_NAME}/${name}`]
  if (!url) throw new Error(`Action ${name} is not configured`)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const data = await response.json().catch(() => null)

  if (!response.ok || !data || data.ok === false) {
    throw new Error(data?.error?.message || `Action ${name} failed`)
  }

  return data
}
