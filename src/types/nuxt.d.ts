declare module "@nuxt/kit" {
  type RuntimeConfigBase = Record<string, unknown> & {
    aperture?: Record<string, unknown>;
  };

  export interface Nuxt {
    options: {
      runtimeConfig: RuntimeConfigBase;
    };
    hook<T = void>(name: string, fn: (...args: any[]) => T | Promise<T>): void;
  }

  export interface NuxtModuleMeta {
    name?: string;
    configKey?: string;
    compatibility?: Record<string, string>;
  }

  export interface NuxtModuleDefinition<TOptions> {
    meta?: NuxtModuleMeta;
    defaults?: TOptions;
    setup(options: TOptions, nuxt: Nuxt): void | Promise<void>;
  }

  /**
   * Declares a Nuxt module using the provided configuration object.
   * @param {NuxtModuleDefinition<TOptions>} definition - Module definition describing setup and defaults.
   * @returns {NuxtModuleDefinition<TOptions>} The normalized module definition.
   */
  export function defineNuxtModule<TOptions = Record<string, unknown>>(
    definition: NuxtModuleDefinition<TOptions>
  ): NuxtModuleDefinition<TOptions>;

  export interface NuxtPluginTemplate {
    src: string;
    mode?: "server" | "client" | "all";
  }

  /**
   * Registers a Nuxt plugin with the build system.
   * @param {NuxtPluginTemplate} template - Plugin template configuration.
   * @returns {void}
   */
  export function addPlugin(template: NuxtPluginTemplate): void;

  export interface ServerHandlerInput {
    route: string;
    handler: string;
    method?: "get" | "post" | "put" | "patch" | "delete" | "all";
  }

  /**
   * Registers a server handler (Nitro) at a given route.
   * @param {ServerHandlerInput} input - Route and handler configuration.
   * @returns {void}
   */
  export function addServerHandler(input: ServerHandlerInput): void;

  export interface Resolver {
    resolve(path: string): string;
  }

  /**
   * Creates a path resolver scoped to a module directory.
   * @param {string} from - Base path from which to resolve relative paths.
   * @returns {Resolver} A resolver helper.
   */
  export function createResolver(from: string): Resolver;
}

declare module "#app" {
  type RuntimeConfigBase = Record<string, unknown> & {
    aperture?: Record<string, unknown>;
  };

  export interface NuxtApp {
    $config: RuntimeConfigBase;
    $aperture: import("../core/Aperture.js").Aperture;
    $apertureLogger: import("../core/logger/Logger.js").Logger;
    $apertureApi: import(
      "../integrations/nuxt/runtime/composables/useAperture.js"
    ).ApertureClientApi;
  }

  export interface ComponentCustomProperties {
    $aperture: import("../core/Aperture.js").Aperture;
    $apertureLogger: import("../core/logger/Logger.js").Logger;
    $apertureApi: import(
      "../integrations/nuxt/runtime/composables/useAperture.js"
    ).ApertureClientApi;
  }

  /**
   * Defines a Nuxt plugin that can inject values into the app context.
   * @param {((nuxtApp: NuxtApp) => { provide?: Record<string, unknown> } | void) | ((nuxtApp: NuxtApp) => Promise<{ provide?: Record<string, unknown> } | void>)} plugin - Plugin factory executed during app initialization.
   * @returns {void}
   */
  export function defineNuxtPlugin(
    plugin:
      | ((nuxtApp: NuxtApp) => { provide?: Record<string, unknown> } | void)
      | ((
          nuxtApp: NuxtApp
        ) => Promise<{ provide?: Record<string, unknown> } | void>)
  ): void;
}

declare module "#imports" {
  /**
   * Retrieves the runtime configuration available within the Nuxt app.
   * @template T
   * @returns {T} Runtime configuration object.
   */
  export function useRuntimeConfig<T = Record<string, unknown>>(): T;

  export function useAperture(): import(
    "../integrations/nuxt/runtime/composables/useAperture.js"
  ).UseApertureResult;
}
