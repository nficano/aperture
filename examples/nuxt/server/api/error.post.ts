import { defineEventHandler } from 'h3'
import { getApertureInstance } from '../../../../src/integrations/nuxt/runtime/server-utils'

export default defineEventHandler(async () => {
  const aperture = getApertureInstance()
  const logger = aperture?.getLogger({ tags: { handler: 'error' } })

  try {
    throw new Error('Server demo error')
  } catch (e: any) {
    logger?.error('Captured server error', {
      error: e,
      tags: { route: '/api/error' },
      domain: 'auth',
      impact: 'reliability',
    })
  }

  return { ok: true }
})

