<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="http://assets.nickficano.com/aperture-logo-dark.svg" />
    <img src="http://assets.nickficano.com/aperture-logo-light.svg" alt="Aperture" width="438" height="94" />
  </picture>
</p>

# Aperture

Aperture is a domain-driven observability toolkit tailored for Nuxt and Node.js services. It unifies structured logging, instrumentation, and provider orchestration so teams can capture business context, impact, and customer journeys with minimal ceremony.

## Notice:

**Aperture is still a work-in-progress. I don't suggest relying on it**

## Highlights

- **Domain + impact-aware logging**: scope every event to business domains and impact classes (revenue, engagement, performance, reliability).
- **User journey instruments**: trace funnels, API calls, and conversions with async-safe context propagation.
- **Pluggable providers**: console (rich dev output), Firebase, Sentry, Datadog, New Relic, or any HTTP endpoint.
- **Async context management**: leverage `AsyncLocalStorage` to keep tags, user traits, and instrumentation data across awaits.

## Getting Started

```bash
npm install @nficano/aperture
```

### Nuxt Integration

1. Enable the module in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ["@nficano/aperture/nuxt"],
  aperture: {
    environment: process.env.NODE_ENV,
    defaultTags: { service: "nuxt-app" },
    domains: [
      { name: "auth", defaultImpact: "reliability" },
      { name: "content", defaultImpact: "engagement" },
    ],
    providers: {
      console: true,
      sentry: process.env.SENTRY_DSN
        ? { dsn: process.env.SENTRY_DSN, tracesSampleRate: 1.0 }
        : false,
      datadog: process.env.DATADOG_API_KEY
        ? { apiKey: process.env.DATADOG_API_KEY, service: "nuxt-app" }
        : false,
    },
  },
});
```

2. Use the injected logger inside middleware or composables:

```ts
export default defineEventHandler(async (event) => {
  const { $apertureLogger } = event.context.nuxt;

  const authLogger = $apertureLogger
    .withDomain("auth")
    .withImpact("reliability")
    .withTags({ route: event.path });

  const instrument = instrumentApiCall(authLogger, "POST /api/login");

  return instrument.run(async () => {
    // ... auth logic
    return { status: "ok" };
  });
});
```

### Node.js Service

```ts
import { Aperture, ConsoleProvider, instrumentFunnel } from "@nficano/aperture";

const aperture = new Aperture({
  environment: process.env.NODE_ENV ?? "development",
  defaultTags: { service: "checkout-service" },
  domains: [{ name: "ecommerce", defaultImpact: "revenue" }],
});

autowire();

const logger = aperture.getLogger().withDomain("ecommerce");

async function handleCheckout(orderId: string) {
  return instrumentFunnel(logger, "checkout-flow", {
    impact: "revenue",
    tags: { orderId },
  }).run(async () => {
    logger.info("Cart validated", { impact: "engagement" });
    logger.info("Payment authorized", { impact: "revenue" });
  });
}

function autowire() {
  aperture.registerProvider(new ConsoleProvider());
  if (process.env.DATADOG_API_KEY) {
    aperture.registerProvider(
      new DatadogProvider({
        apiKey: process.env.DATADOG_API_KEY,
        service: "checkout-service",
      })
    );
  }
}
```

### Provider Injection

- Development: console-only rich logs.
- Production: layer any combination of Firebase, Sentry, Datadog, or New Relic.

```ts
const aperture = new Aperture({ environment: "production" });
aperture.registerProvider(new ConsoleProvider({ enableColors: false }));
aperture.registerProvider(new SentryProvider({ dsn: process.env.SENTRY_DSN }));
aperture.registerProvider(
  new DatadogProvider({
    apiKey: process.env.DATADOG_API_KEY!,
    service: "public-api",
  })
);
```

### Instruments Cheat-Sheet

```ts
const journey = instrumentUserJourney(logger, "onboarding", {
  impact: "engagement",
});
await journey
  .step({ step: "start" })
  .annotate({ plan: "pro" })
  .run(async () => {
    await instrumentApiCall(logger, "POST /api/send-welcome").run(
      callWelcomeApi
    );
    await instrumentConversion(logger, "trial-to-paid", {
      impact: "revenue",
    }).run(upgradeUser);
  });
```

## Repository Map

- `src/core/*`: logging, context, domains, and instrumentation primitives.
- `src/providers/*`: first-party provider implementations.
- `src/integrations/*`: framework integrations (e.g., Nuxt module + runtime plugin).
- `examples/*`: end-to-end usage snippets.

---

Aperture is designed to grow with your observability stack—compose new providers, enrich domains, and track funnels without losing sight of the business impact behind every metric.
