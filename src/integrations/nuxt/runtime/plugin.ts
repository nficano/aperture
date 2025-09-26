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
  isServer: boolean
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
    // Inject runtime config values for New Relic credentials
    const runtimeConfig = useRuntimeConfig() as any;
    const enrichedConfig = {
      ...newRelicConfig,
      licenseKey: runtimeConfig.newRelicLicenseKey || newRelicConfig.licenseKey,
      accountID:
        runtimeConfig.public?.newRelicAccountId || newRelicConfig.accountID,
      trustKey:
        runtimeConfig.public?.newRelicTrustKey || newRelicConfig.trustKey,
      agentID: runtimeConfig.public?.newRelicAgentId || newRelicConfig.agentID,
      applicationID:
        runtimeConfig.public?.newRelicApplicationId ||
        newRelicConfig.applicationID,
    };
    aperture.registerProvider(new NewRelicProvider(enrichedConfig));
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

    // Inject New Relic browser agent on client side
    if (!isServer && apertureConfig.providers?.newRelic) {
      const newRelicConfig = apertureConfig.providers.newRelic;
      if (isOptionEnabled(newRelicConfig)) {
        try {
          // Use runtime config for browser agent credentials
          const runtimeConfig = useRuntimeConfig() as any;
          const enrichedConfig = {
            ...newRelicConfig,
            licenseKey:
              runtimeConfig.newRelicLicenseKey || newRelicConfig.licenseKey,
            accountID:
              runtimeConfig.public?.newRelicAccountId ||
              newRelicConfig.accountID,
            trustKey:
              runtimeConfig.public?.newRelicTrustKey || newRelicConfig.trustKey,
            agentID:
              runtimeConfig.public?.newRelicAgentId || newRelicConfig.agentID,
            applicationID:
              runtimeConfig.public?.newRelicApplicationId ||
              newRelicConfig.applicationID,
          };

          const browserScript =
            NewRelicProvider.generateBrowserAgentScript(enrichedConfig);
          // Inject the script into the document head
          const globalDoc = globalThis as {
            document?: {
              createElement: (tag: string) => { innerHTML: string };
              head: { append: (element: unknown) => void };
            };
          };
          if (globalDoc.document) {
            const scriptElement = globalDoc.document.createElement("div");
            scriptElement.innerHTML = browserScript;
            globalDoc.document.head.append(scriptElement);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("Failed to initialize New Relic browser agent:", error);
        }
      }
    }

    return {
      provide: {
        aperture,
        apertureLogger: logger,
      },
    };
  }
);
