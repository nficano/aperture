import { ApertureLogger } from "./logger/Logger.js";
import { DomainRegistry } from "./domains/DomainRegistry.js";
import { ContextManager } from "./context/ContextManager.js";
import type {
  ApertureContext,
  ApertureOptions,
  ApertureProvider,
  Domain,
  DomainDefinition,
  Logger,
  LoggerConfig,
  ProviderContext,
  TagRecord,
} from "../types/index.js";
type ConsoleLike = {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
};

const globalEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const diagnosticConsole =
  (globalThis as unknown as { console?: ConsoleLike }).console ??
  ({
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    log: () => undefined,
  } satisfies ConsoleLike);

export type { ApertureOptions } from "../types/index.js";

/**
 * Orchestrates provider setup and scoped logging for the Aperture observability toolkit.
 */
export class Aperture {
  private readonly environment: "development" | "production" | "test";
  private readonly domainRegistry = new DomainRegistry();
  private readonly providers: ApertureProvider[] = [];
  private readonly defaultTags: TagRecord | undefined;
  private readonly release: string | undefined;
  private readonly runtime: Record<string, unknown> | undefined;

  /**
   * Creates a new Aperture instance with optional defaults and pre-registered providers.
   * @param {ApertureOptions} [options] - Runtime defaults including environment, tags, domains, and providers.
   */
  constructor(options: ApertureOptions = {}) {
    this.environment =
      options.environment ?? (globalEnv.NODE_ENV as any) ?? "development";
    this.defaultTags = options.defaultTags;
    this.release = options.release;
    this.runtime = options.runtime;

    options.domains?.forEach((definition) =>
      this.domainRegistry.register(definition)
    );
    options.providers?.forEach((provider) => {
      this.registerProvider(provider);
    });
  }

  /**
   * Registers a provider and invokes its setup routine with the shared runtime context.
   * @param {ApertureProvider} provider - The provider implementation to register.
   * @returns {void}
   */
  registerProvider(provider: ApertureProvider): void {
    const context: ProviderContext = {
      environment: this.environment,
      release: this.release,
      runtime: this.runtime,
    };

    try {
      const setupResult = provider.setup?.(context);
      if (setupResult instanceof Promise) {
        setupResult.catch((error) => {
          diagnosticConsole.error(
            `[Aperture] Failed to setup provider ${provider.name}`,
            error
          );
        });
      }
    } catch (error) {
      diagnosticConsole.error(
        `[Aperture] Failed to setup provider ${provider.name}`,
        error
      );
    }

    this.providers.push(provider);
  }

  /**
   * Removes a provider by name and triggers its shutdown lifecycle if defined.
   * @param {string} name - The registered provider name to remove.
   * @returns {void}
   */
  removeProvider(name: string): void {
    const index = this.providers.findIndex(
      (provider) => provider.name === name
    );
    if (index >= 0) {
      const [provider] = this.providers.splice(index, 1);
      const shutdownResult = provider.shutdown?.();
      if (shutdownResult instanceof Promise) {
        shutdownResult.catch((error) => {
          diagnosticConsole.error(
            `[Aperture] Failed to shutdown provider ${provider.name}`,
            error
          );
        });
      }
    }
  }

  /**
   * Lists the names of all currently registered providers.
   * @returns {string[]} An array of provider names in registration order.
   */
  listProviders(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  /**
   * Gets the shared domain registry for configuring domain metadata.
   * @returns {DomainRegistry} The registry used by this Aperture instance.
   */
  getDomainRegistry(): DomainRegistry {
    return this.domainRegistry;
  }

  /**
   * Creates a scoped logger backed by the current provider set.
   * @param {Partial<ApertureContext>} [scope] - Optional context to merge into emitted events.
   * @returns {Logger} A logger that dispatches events to registered providers.
   */
  getLogger(scope?: Partial<ApertureContext>): Logger {
    const config: LoggerConfig = {
      environment: this.environment,
      providers: this.providers,
      defaultTags: this.defaultTags,
    };

    if (!scope) {
      return new ApertureLogger(config);
    }

    return new ApertureLogger(config, scope);
  }

  /**
   * Runs a callback with the domain's default impact and tags merged into context.
   * @template T
   * @param {Domain} domain - Domain identifier to apply.
   * @param {() => T} fn - Function executed with the augmented context.
   * @returns {T} The callback result.
   */
  withDomain<T>(domain: Domain, fn: () => T): T {
    const definition = this.domainRegistry.get(domain);

    return ContextManager.runWithContext(
      {
        domain,
        impact: definition?.defaultImpact,
        tags: {
          ...(definition?.defaultTags ?? {}),
        },
      },
      fn
    );
  }

  /**
   * Runs a callback with additional context merged on top of the current scope.
   * @template T
   * @param {ApertureContext} context - Context values to merge for the callback duration.
   * @param {() => T} fn - Function executed while the context is active.
   * @returns {T} The callback result.
   */
  withContext<T>(context: ApertureContext, fn: () => T): T {
    return ContextManager.runWithContext(context, fn);
  }

  /**
   * Flushes all providers that implement a flush lifecycle hook.
   * @returns {Promise<void>} Resolves when all flush operations complete.
   */
  async flush(): Promise<void> {
    const tasks = this.providers
      .map((provider) => provider.flush?.())
      .filter((task): task is Promise<void> | void => task !== undefined)
      .map((task) => Promise.resolve(task));

    await Promise.all(tasks);
  }

  /**
   * Shuts down all providers that expose a shutdown lifecycle hook.
   * @returns {Promise<void>} Resolves when all shutdown operations finish.
   */
  async shutdown(): Promise<void> {
    const tasks = this.providers
      .map((provider) => provider.shutdown?.())
      .filter((task): task is Promise<void> | void => task !== undefined)
      .map((task) => Promise.resolve(task));

    await Promise.all(tasks);
  }
}
