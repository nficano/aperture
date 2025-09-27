<template>
  <main class="container">
    <h1>Aperture Nuxt Example</h1>
    <p>
      Providers: Console (client+server), Datadog (server), New Relic (server).
    </p>

    <section>
      <h2>Client Actions</h2>
      <div class="grid">
        <button @click="clientConsoleLog">Client Console Log</button>
        <button @click="sendLog">Send Log (via tunnel)</button>
        <button @click="sendMetric">Send Metric</button>
        <button @click="sendError">Send Error</button>
        <button @click="sendRum">Send RUM Snapshot</button>
      </div>
    </section>

    <section>
      <h2>Server Actions</h2>
      <div class="grid">
        <button @click="callDemo">Call /api/demo (server logs + metric)</button>
      </div>
      <pre v-if="serverData">{{ serverData }}</pre>
    </section>
  </main>
</template>

<script setup lang="ts">
const { $aperture, $apertureLogger, $apertureApi } = useNuxtApp() as any

function clientConsoleLog() {
  // Local console provider (client-side)
  $apertureLogger?.info('Client console log', {
    tags: { source: 'client', demo: true },
    domain: 'content',
    impact: 'engagement',
  })
}

function sendLog() {
  // Send to server tunnel, then fanned out to server providers
  $apertureApi?.log('info', 'Hello from client via tunnel', { foo: 'bar' }, {
    domain: 'auth',
    impact: 'reliability',
    client: true,
  })
}

function sendMetric() {
  $apertureApi?.metric('button_click', 1, 'count', { page: 'index' })
}

function sendError() {
  try {
    throw new Error('Boom - client demo error')
  } catch (e) {
    $apertureApi?.error(e, {
      message: 'Client error captured',
      tags: { component: 'IndexPage' },
    })
  }
}

function getFCP(): number | undefined {
  try {
    const perf = performance.getEntriesByType('paint') as PerformanceEntry[]
    const fcp = perf.find((e: any) => e.name === 'first-contentful-paint') as any
    return fcp?.startTime as number | undefined
  } catch { /* noop */ }
}

function sendRum() {
  const url = typeof window !== 'undefined' ? window.location.href : undefined
  const fcp = getFCP()
  $apertureApi?.rum({
    url,
    webVitals: { fcp },
    tags: { page: 'index' },
  })
}

const serverData = ref<any>('')
async function callDemo() {
  serverData.value = await $fetch('/api/demo')
}
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
}
h1 {
  margin-bottom: 0.25rem;
}
section {
  margin-top: 1.5rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.5rem;
}
button {
  padding: 0.75rem 1rem;
}
pre {
  margin-top: 0.75rem;
  background: #1111;
  padding: 0.75rem;
  border-radius: 6px;
}
</style>

