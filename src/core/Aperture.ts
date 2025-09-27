import { ApertureLogger } from "./logger/Logger.js";
import { DomainRegistry } from "./domains/DomainRegistry.js";
import { ContextManager } from "./context/ContextManager.js";
import type {
  ApertureContext,
  ApertureOptions,
  ApertureProvider,
  Domain,
  Logger,
  LoggerConfig,
  LogEvent,
  MetricEvent,
  ProviderChannel,
  ProviderContext,
  ProviderFallbackConfig,
  ProviderRegistrationInput,
  ProviderSupportLevel,
  ProviderSupportMatrix,
  RegisterProviderOptions,
  RegisteredProvider,
  TagRecord,
  TraceEvent,
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
    error: () => {},
    warn: () => {},
    info: () => {},
    log: () => {},
  } satisfies ConsoleLike);

const detectChannel = (): ProviderChannel =>
  (typeof (globalThis as { window?: unknown }).window === "undefined"
    ? "server"
    : "client");

const DEFAULT_FALLBACKS: ProviderFallbackConfig = {
  forceLogMetrics: false,
  forceLogTraces: false,
  fallbackToClient: false,
};

const CONSOLE_FALLBACKS: ProviderFallbackConfig = {
  forceLogMetrics: true,
  forceLogTraces: true,
  fallbackToClient: false,
};

const deriveSupports = (
  provider: ApertureProvider,
  overrides?: ProviderSupportMatrix,
): ProviderSupportMatrix => ({
  logs:
    overrides?.logs ?? (typeof provider.log === "function" ? "full" : "none"),
  metrics:
    overrides?.metrics ??
    (typeof provider.metric === "function" ? "full" : "none"),
  traces:
    overrides?.traces ??
    (typeof provider.trace === "function" ? "full" : "none"),
});

const resolveFallbacks = (
  providerName: string,
  overrides?: ProviderFallbackConfig,
): ProviderFallbackConfig => {
  const base = providerName === "console" ? CONSOLE_FALLBACKS : DEFAULT_FALLBACKS;
  return {
    forceLogMetrics: overrides?.forceLogMetrics ?? base.forceLogMetrics,
    forceLogTraces: overrides?.forceLogTraces ?? base.forceLogTraces,
    fallbackToClient: overrides?.fallbackToClient ?? base.fallbackToClient,
  };
};

const hasSupport = (level: ProviderSupportLevel | undefined): boolean =>
  level === "full" || level === "limited";

const isWrappedRegistration = (
  value: ProviderRegistrationInput | ApertureProvider,
): value is { provider: ApertureProvider; options?: RegisterProviderOptions } =>
  Boolean(
    value &&
      typeof value === "object" &&
      "provider" in value &&
      (value as any).provider &&
      typeof (value as any).provider.name === "string",
  );

export type { ApertureOptions } from "../types/index.js";

/**
 * Orchestrates provider setup and scoped logging for the Aperture observability toolkit.
 */
export class Aperture {
  private readonly environment: "development" | "production" | "test";
  private readonly domainRegistry = new DomainRegistry();
  private readonly providers: RegisteredProvider[] = [];
  private readonly defaultTags: TagRecord | undefined;
  private readonly release: string | undefined;
  private readonly runtime: Record<string, unknown> | undefined;
  private readonly channel: ProviderChannel;

  /**
   * Creates a new Aperture instance with optional defaults and pre-registered providers.
   * @param {ApertureOptions} [options] - Runtime defaults including environment, tags, domains, and providers.
   */
  constructor(options: ApertureOptions = {}) {
    this.environment =
      options.environment ?? (globalEnv.NODE_ENV as any) ?? "development";
    this.channel = detectChannel();
    this.defaultTags = options.defaultTags;
    this.release = options.release;
    this.runtime = options.runtime;

    if (options.domains)
      for (const definition of options.domains)
        this.domainRegistry.register(definition);
    if (options.providers)
      for (const provider of options.providers) {
        this.registerProvider(provider);
      }
  }

  /**
   * Registers a provider and invokes its setup routine with the shared runtime context.
   * @param {ProviderRegistrationInput | ApertureProvider} registration - Provider instance or wrapped registration metadata.
   * @param {RegisterProviderOptions} [inlineOptions] - Optional overrides applied when invoking programmatically.
   * @returns {void}
   */
  registerProvider(
    registration: ProviderRegistrationInput | ApertureProvider,
    inlineOptions?: RegisterProviderOptions,
  ): void {
    const wrapped = isWrappedRegistration(registration)
      ? registration
      : { provider: registration as ApertureProvider, options: undefined };

    const provider = wrapped.provider;
    const resolvedOptions: RegisterProviderOptions = {
      ...(wrapped.options ?? {}),
      ...(inlineOptions ?? {}),
    };

    const targetChannel = resolvedOptions.channel ?? this.channel;
    if (targetChannel !== this.channel) {
      diagnosticConsole.info?.(
        `[Aperture] Skipping provider ${provider.name} for channel ${targetChannel}; current channel ${this.channel}.`,
      );
      return;
    }

    const context: ProviderContext = {
      environment: this.environment,
      release: this.release,
      runtime: this.runtime,
    };

    try {
      diagnosticConsole.info?.(
        `[Aperture] Registering provider ${provider.name} (${targetChannel})`,
      );
      const setupResult = provider.setup?.(context);
      if (setupResult instanceof Promise) {
        setupResult.catch((error) => {
          diagnosticConsole.error(
            `[Aperture] Failed to setup provider ${provider.name}`,
            error,
          );
        });
      }
    } catch (error) {
      diagnosticConsole.error(
        `[Aperture] Failed to setup provider ${provider.name}`,
        error,
      );
    }

    const supports = deriveSupports(provider, resolvedOptions.supports);
    const fallbacks = resolveFallbacks(
      provider.name,
      resolvedOptions.fallbacks,
    );

    this.providers.push({
      name: provider.name,
      instance: provider,
      channel: targetChannel,
      supports,
      fallbacks,
    });

    diagnosticConsole.info?.(
      `[Aperture] Provider registered ${provider.name}. Total providers: ${this.providers.length}`,
    );
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
    if (index !== -1) {
      const [provider] = this.providers.splice(index, 1);
      const shutdownResult = provider.instance.shutdown?.();
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
   * Emits a metric event to all registered providers that support metrics.
   * @param {import('../types/index.js').MetricEvent} event - Metric event to forward.
   * @returns {void}
   */
  emitMetric(event: MetricEvent): void {
    for (const provider of this.providers) {
      diagnosticConsole.info?.(
        `[Aperture] emitMetric forwarding to ${provider.name}`,
      );

      if (hasSupport(provider.supports.metrics)) {
        provider.instance.metric?.(event);
        continue;
      }

      if (!provider.fallbacks.forceLogMetrics) {
        diagnosticConsole.info?.(
          `[Aperture] Provider ${provider.name} lacks metric support and fallback disabled.`,
        );
        continue;
      }

      if (typeof provider.instance.log === "function") {
        provider.instance.log(this.metricToLog(event));
      }
    }
  }

  /**
   * Emits a trace event to all registered providers, falling back to logs when configured.
   * @param {TraceEvent} event - Trace event to forward.
   * @returns {void}
   */
  emitTrace(event: TraceEvent): void {
    for (const provider of this.providers) {
      diagnosticConsole.info?.(
        `[Aperture] emitTrace forwarding to ${provider.name}`,
      );

      if (hasSupport(provider.supports.traces)) {
        provider.instance.trace?.(event);
        continue;
      }

      if (!provider.fallbacks.forceLogTraces) {
        diagnosticConsole.info?.(
          `[Aperture] Provider ${provider.name} lacks trace support and fallback disabled.`,
        );
        continue;
      }

      if (typeof provider.instance.log === "function") {
        provider.instance.log(this.traceToLog(event));
      }
    }
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
          ...definition?.defaultTags,
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

  private metricToLog(event: MetricEvent): LogEvent {
    return {
      level: "info",
      message: `metric:${event.name}`,
      timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(),
      domain: event.domain,
      impact: event.impact,
      tags: event.tags,
      context: {
        ...event.context,
        value: event.value,
        unit: event.unit,
        __fallback: "metric-as-log",
      },
      instrumentation: event.instrumentation,
      runtime: {
        environment: this.environment,
      },
    };
  }

  private traceToLog(event: TraceEvent): LogEvent {
    return {
      level: event.status === "error" ? "error" : "info",
      message: `trace:${event.name}`,
      timestamp: event.endTime ?? event.startTime ?? new Date(),
      domain: event.domain,
      impact: event.impact,
      tags: event.tags,
      context: {
        ...event.context,
        traceId: event.traceId,
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        startTime: event.startTime,
        endTime: event.endTime,
        status: event.status,
        attributes: event.attributes,
        __fallback: "trace-as-log",
      },
      instrumentation: event.instrumentation,
      runtime: {
        environment: this.environment,
      },
    };
  }

  /**
   * Flushes all providers that implement a flush lifecycle hook.
   * @returns {Promise<void>} Resolves when all flush operations complete.
   */
  async flush(): Promise<void> {
    const tasks = this.providers
      .map((provider) => provider.instance.flush?.())
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
      .map((provider) => provider.instance.shutdown?.())
      .filter((task): task is Promise<void> | void => task !== undefined)
      .map((task) => Promise.resolve(task));

    await Promise.all(tasks);
  }
}
