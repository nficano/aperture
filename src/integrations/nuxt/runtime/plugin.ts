import { defineNuxtPlugin } from "#app";
import { useRuntimeConfig } from "#imports";
import { Aperture } from "../../../core/Aperture.js";
import { ConsoleProvider } from "../../../providers/ConsoleProvider.js";
import { FirebaseProvider } from "../../../providers/FirebaseProvider.js";
import { SentryProvider } from "../../../providers/SentryProvider.js";
import { DatadogProvider } from "../../../providers/DatadogProvider.js";
import { NewRelicProvider } from "../../../providers/NewRelicProvider.js";
import type { ApertureNuxtProviderOptions } from "../module.js";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const GLOBAL_KEY = Symbol.for("aperture.instance");

type ApertureGlobal = Record<PropertyKey, unknown> & { window?: unknown };

/**
 * Type guard that filters disabled provider options.
 * @template T
 * @param {T | false | undefined} value - Provider option to evaluate.
 * @returns {value is T} True when the option represents an enabled configuration.
 */
const isOptionEnabled = <T>(value: T | false | undefined): value is T =>
  value !== undefined && value !== false;

/**
 * Registers enabled providers on the shared Aperture instance.
 * @param {Aperture} aperture - Aperture instance used for registration.
 * @param {ApertureNuxtProviderOptions | undefined} providers - Module-level provider options.
 * @param {boolean} isServer - Whether the plugin runs on the server.
 * @returns {void}
 */
function resolveProviders(
  aperture: Aperture,
  providers: ApertureNuxtProviderOptions | undefined,
  isServer: boolean,
) {
  const configured = providers ?? {};
  const existing = new Set(aperture.listProviders());

  if (configured.console !== false && !existing.has("console")) {
    const consoleOptions =
      configured.console === true || configured.console === undefined
        ? {}
        : configured.console;
    aperture.registerProvider(new ConsoleProvider(consoleOptions));
  }

  if (!isServer) {
    return;
  }

  const sentryConfig = configured.sentry;
  if (isOptionEnabled(sentryConfig) && !existing.has("sentry")) {
    aperture.registerProvider(new SentryProvider(sentryConfig));
  }

  const firebaseConfig = configured.firebase;
  if (isOptionEnabled(firebaseConfig) && !existing.has("firebase")) {
    aperture.registerProvider(new FirebaseProvider(firebaseConfig));
  }

  const datadogConfig = configured.datadog;
  if (isOptionEnabled(datadogConfig) && !existing.has("datadog")) {
    aperture.registerProvider(new DatadogProvider(datadogConfig));
  }

  const newRelicConfig = configured.newRelic;
  if (isOptionEnabled(newRelicConfig) && !existing.has("newrelic")) {
    aperture.registerProvider(new NewRelicProvider(newRelicConfig));
  }
}

export default defineNuxtPlugin(
  /**
   * Bootstraps the shared Aperture instance and injects it into the Nuxt app context.
   * @returns {{ provide: { aperture: Aperture; apertureLogger: ReturnType<Aperture['getLogger']> } }} Provided runtime injections.
   */
  () => {
  const runtimeConfig = useRuntimeConfig();
  const apertureConfig = (runtimeConfig as any).aperture ?? {};
  const rawEnvironment =
    apertureConfig.environment ?? env.NODE_ENV ?? "development";
  const environment = rawEnvironment as "development" | "production" | "test";

  const globalObject = globalThis as ApertureGlobal;
  const isServer = globalObject.window === undefined;
  let aperture = globalObject[GLOBAL_KEY] as Aperture | undefined;

  if (!aperture) {
    aperture = new Aperture({
      environment,
      defaultTags: apertureConfig.defaultTags,
      release: apertureConfig.release,
      runtime: apertureConfig.runtime,
      domains: apertureConfig.domains,
    });

    if (Array.isArray(apertureConfig.domains)) {
      aperture.getDomainRegistry().registerMany(apertureConfig.domains);
    }

    resolveProviders(aperture, apertureConfig.providers, isServer);

    globalObject[GLOBAL_KEY] = aperture;
  }

  const logger = aperture.getLogger();

  return {
    provide: {
      aperture,
      apertureLogger: logger,
    },
  };
  },
);
