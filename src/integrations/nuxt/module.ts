import { defineNuxtModule, addPlugin, createResolver } from "@nuxt/kit";
import type {
  ApertureNuxtOptions,
  ApertureNuxtProviderOptions,
} from "../../types/index.js";

export type {
  ApertureNuxtOptions,
  ApertureNuxtProviderOptions,
} from "../../types/index.js";

export default defineNuxtModule<ApertureNuxtOptions>({
  meta: {
    name: "aperture/nuxt",
    configKey: "aperture",
  },
  defaults: {
    enabled: true,
    providers: {
      console: true,
    },
  },
  /**
   * Registers the Aperture plugin and propagates module configuration to runtime config.
   * @param {ApertureNuxtOptions} options - Module configuration supplied by the Nuxt user.
   * @param {import('@nuxt/kit').Nuxt} nuxt - Nuxt application instance provided to modules.
   * @returns {void}
   */
  setup(options, nuxt) {
    if (options.enabled === false) {
      return;
    }

    const resolver = createResolver(
      (import.meta as ImportMeta & { url: string }).url
    );
    const runtimeConfig = nuxt.options.runtimeConfig;

    runtimeConfig.aperture = {
      ...(runtimeConfig.aperture ?? {}),
      environment: options.environment,
      defaultTags: options.defaultTags,
      release: options.release,
      runtime: options.runtime,
      domains: options.domains ?? [],
      providers: options.providers ?? {},
    };

    nuxt.hook(
      "nitro:config",
      /**
       * Merges module configuration into Nitro runtimeConfig during build.
       * @param {Record<string, unknown>} nitroConfig - Nitro configuration object being prepared.
       * @returns {void}
       */
      (nitroConfig) => {
        nitroConfig.runtimeConfig = nitroConfig.runtimeConfig || {};
        nitroConfig.runtimeConfig.aperture = {
          ...(nitroConfig.runtimeConfig.aperture ?? {}),
          ...(runtimeConfig.aperture ?? {}),
        };
      }
    );

    addPlugin({
      src: resolver.resolve("./runtime/plugin"),
      mode: "all",
    });
  },
});
