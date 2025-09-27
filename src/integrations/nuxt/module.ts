import {
  defineNuxtModule,
  addPlugin,
  createResolver,
  addServerHandler,
  addImportsDir,
} from "@nuxt/kit";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ApertureNuxtOptions } from "../../types/index.js";

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
    tunnel: {
      path: "/api/aperture",
    },
  },
  /**
   * Registers the Aperture plugin and propagates module configuration to runtime config.
   */
  setup(options, nuxt) {
    if (options.enabled === false) {
      return;
    }

    // Robust resolver that works under both ESM and jiti (data: URL) execution
    let from: string;
    const metaUrl = (import.meta as ImportMeta & { url?: string }).url;
    if (typeof metaUrl === "string" && metaUrl.startsWith("file:")) {
      try {
        from = path.dirname(fileURLToPath(metaUrl));
      } catch {
        // Fallback to __dirname when fileURLToPath fails
        // @ts-ignore __dirname is provided by jiti during dev
        from = typeof __dirname === "string" ? __dirname : process.cwd();
      }
    } else {
      // Running via jiti or non-file scheme: use __dirname when available
      // @ts-ignore __dirname is provided by jiti during dev
      from = typeof __dirname === "string" ? __dirname : process.cwd();
    }
    const resolver = createResolver(from);
    const runtimeConfig = nuxt.options.runtimeConfig;
    const tunnelPath = options.tunnel?.path ?? "/api/aperture";

    runtimeConfig.aperture = {
      ...runtimeConfig.aperture,
      environment: options.environment,
      defaultTags: options.defaultTags,
      release: options.release,
      runtime: options.runtime,
      domains: options.domains ?? [],
      providers: options.providers ?? {},
      tunnel: {
        path: options.tunnel?.path ?? "/api/aperture",
        jwtSecret: options.tunnel?.jwtSecret,
        csrfHeader: options.tunnel?.csrfHeader,
        sampling: options.tunnel?.sampling,
        rateLimitPerMin: options.tunnel?.rateLimitPerMin,
        debug: options.tunnel?.debug,
      },
    };

    nuxt.hook(
      "nitro:config",
      /**
       * Merges module configuration into Nitro runtimeConfig during build.
       */
      (nitroConfig) => {
        nitroConfig.runtimeConfig = nitroConfig.runtimeConfig || {};
        nitroConfig.runtimeConfig.aperture = {
          ...nitroConfig.runtimeConfig.aperture,
          ...runtimeConfig.aperture,
        };
      }
    );

    // Register the POST tunnel intake handler
    if (typeof addServerHandler === "function") {
      addServerHandler({
        route: tunnelPath,
        method: "all",
        handler: resolver.resolve("./runtime/tunnel-handler"),
      });
    }

    addPlugin({
      src: resolver.resolve("./runtime/plugin"),
      mode: "all",
    });

    if (typeof addImportsDir === "function") {
      addImportsDir(resolver.resolve("./runtime/composables"));
    }
  },
});
