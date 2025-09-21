import { Aperture } from "../../src/core/Aperture.js";
import { ConsoleProvider } from "../../src/providers/ConsoleProvider.js";
import { DatadogProvider } from "../../src/providers/DatadogProvider.js";
import { instrumentFunnel } from "../../src/core/instruments/Instrumentation.js";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const aperture = new Aperture({
  environment: env.NODE_ENV === "production" ? "production" : "development",
  defaultTags: {
    service: "checkout-service",
  },
  domains: [
    {
      name: "ecommerce",
      defaultImpact: "revenue",
      defaultTags: {
        region: env.REGION ?? "us-east-1",
      },
    },
  ],
});

autowireProviders();

const logger = aperture.getLogger().withDomain("ecommerce");

function processCheckout(orderId: string) {
  const funnel = instrumentFunnel(logger, "checkout-flow", {
    impact: "revenue",
    tags: { orderId },
  });

  return funnel.run(() => {
    funnel.step({ step: "cart-validated" });

    logger.info("Calculating promotions", {
      tags: { orderId },
      impact: "engagement",
    });

    funnel.step({ step: "payment-authorized" });

    logger.info("Order captured", {
      tags: { orderId },
      impact: "revenue",
    });

    return { orderId, status: "completed" };
  });
}

function autowireProviders() {
  aperture.registerProvider(new ConsoleProvider());

  if (env.NODE_ENV === "production" && env.DATADOG_API_KEY) {
    aperture.registerProvider(
      new DatadogProvider({
        apiKey: env.DATADOG_API_KEY,
        service: "checkout-service",
        environment: env.NODE_ENV,
        tags: {
          team: "growth",
        },
      })
    );
  }
}

processCheckout("order-abc-123").catch((error) => {
  logger.error("Checkout failed", { error, impact: "reliability" });
});
