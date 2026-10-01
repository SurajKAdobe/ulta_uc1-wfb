import { callAction } from '../api'

export async function generateFireflyBackground (prompt) {
  return callAction('firefly-generate', { prompt })
}

export async function getFireflyGenerationStatus ({ jobId, statusUrl }) {
  return callAction('firefly-generation-status', { jobId, statusUrl })
}
