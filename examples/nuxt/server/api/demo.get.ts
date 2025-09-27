import { defineEventHandler } from 'h3'
import { getApertureInstance } from '../../../../src/integrations/nuxt/runtime/server-utils'

export default defineEventHandler(async () => {
  const aperture = getApertureInstance()
  const logger = aperture?.getLogger({ tags: { handler: 'demo' } })

  logger?.info('Server demo route hit', {
    domain: 'content',
    impact: 'engagement',
    tags: { route: '/api/demo' },
  })

  aperture?.emitMetric({
    name: 'demo_requests',
    value: 1,
    unit: 'count',
    timestamp: new Date(),
    tags: { route: '/api/demo' },
    domain: 'auth',
    impact: 'reliability',
  })

  return {
    ok: true,
    message: 'Logged server info + metric',
    providers: aperture?.listProviders?.() ?? [],
  }
})

