import { Aperture } from "../../src/core/Aperture.js";
import { ConsoleProvider } from "../../src/providers/ConsoleProvider.js";
import { SentryProvider } from "../../src/providers/SentryProvider.js";
import { DatadogProvider } from "../../src/providers/DatadogProvider.js";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export function createApertureForEnvironment() {
  const environment = (env.NODE_ENV ?? "development") as
    | "development"
    | "production"
    | "test";

  const aperture = new Aperture({
    environment,
    defaultTags: {
      service: "api",
    },
  });

  if (environment === "development") {
    aperture.registerProvider(new ConsoleProvider({ enableColors: true }));
    return aperture;
  }

  aperture.registerProvider(new ConsoleProvider({ enableColors: false }));

  if (env.SENTRY_DSN) {
    aperture.registerProvider(
      new SentryProvider({
        dsn: env.SENTRY_DSN,
        release: env.APP_VERSION,
        environment,
      })
    );
  }

  if (env.DATADOG_API_KEY) {
    aperture.registerProvider(
      new DatadogProvider({
        apiKey: env.DATADOG_API_KEY,
        service: "api",
        environment,
      })
    );
  }

  return aperture;
}
