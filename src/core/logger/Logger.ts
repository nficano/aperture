import type {
  ApertureContext,
  ApertureProvider,
  Domain,
  ImpactType,
  LogEvent,
  LogLevel,
  Logger as LoggerInterface,
  LoggerConfig,
  LogOptions,
  TagRecord,
} from "../../types/index.js";
import { ContextManager } from "../context/ContextManager.js";

const globalEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export type { Logger, LoggerConfig, LogOptions } from "../../types/index.js";

/**
 * Dispatches structured log events to the registered Aperture providers.
 */
export class ApertureLogger implements LoggerInterface {
  private readonly environment: "development" | "production" | "test";
  private readonly providers: ApertureProvider[];
  private readonly defaultTags: TagRecord | undefined;
  private readonly scope: ApertureContext;

  /**
   * Creates a logger configured with environment defaults and optional scope.
   * @param {LoggerConfig} [config] - Base configuration including environment, providers, and default tags.
   * @param {ApertureContext} [scope] - Context applied to every emitted event.
   */
  constructor(config?: LoggerConfig, scope?: ApertureContext) {
    this.environment =
      config?.environment ?? (globalEnv.NODE_ENV as any) ?? "development";
    this.providers = config?.providers ?? [];
    this.defaultTags = config?.defaultTags;
    this.scope = {
      ...scope,
      tags: {
        ...this.defaultTags,
        ...scope?.tags,
      },
    };
  }

  /**
   * Emits a debug-level log event to all providers.
   * @param {string} message - Descriptive log message.
   * @param {LogOptions} [options] - Optional tags, context, and error details.
   * @returns {void}
   */
  debug(message: string, options?: LogOptions): void {
    this.dispatch("debug", message, options);
  }

  /**
   * Emits an info-level log event to all providers.
   * @param {string} message - Descriptive log message.
   * @param {LogOptions} [options] - Optional tags, context, and error details.
   * @returns {void}
   */
  info(message: string, options?: LogOptions): void {
    this.dispatch("info", message, options);
  }

  /**
   * Emits a warn-level log event to all providers.
   * @param {string} message - Descriptive log message.
   * @param {LogOptions} [options] - Optional tags, context, and error details.
   * @returns {void}
   */
  warn(message: string, options?: LogOptions): void {
    this.dispatch("warn", message, options);
  }

  /**
   * Emits an error-level log event to all providers.
   * @param {string} message - Descriptive log message.
   * @param {LogOptions} [options] - Optional tags, context, and error details.
   * @returns {void}
   */
  error(message: string, options?: LogOptions): void {
    this.dispatch("error", message, options);
  }

  /**
   * Returns a child logger with the specified domain applied.
   * @param {Domain} domain - Domain identifier to scope subsequent logs.
   * @returns {LoggerInterface} A child logger bound to the domain.
   */
  withDomain(domain: Domain): LoggerInterface {
    return this.child({ domain });
  }

  /**
   * Returns a child logger with additional tags merged into the scope.
   * @param {TagRecord} tags - Tags to merge into the logger context.
   * @returns {LoggerInterface} A child logger that includes the tags.
   */
  withTags(tags: TagRecord): LoggerInterface {
    const mergedTags = {
      ...this.scope.tags,
      ...tags,
    };

    return this.child({ tags: mergedTags });
  }

  /**
   * Returns a child logger with a specific impact level applied.
   * @param {ImpactType} impact - Impact classification to scope logs.
   * @returns {LoggerInterface} A child logger bound to the impact.
   */
  withImpact(impact: ImpactType): LoggerInterface {
    return this.child({ impact });
  }

  /**
   * Returns a child logger with arbitrary context overrides.
   * @param {Partial<ApertureContext>} context - Context properties to merge.
   * @returns {LoggerInterface} A child logger inheriting existing configuration.
   */
  child(context: Partial<ApertureContext>): LoggerInterface {
    const merged: ApertureContext = {
      ...this.scope,
      ...context,
      tags: {
        ...this.scope.tags,
        ...context.tags,
      },
    };

    return new ApertureLogger(
      {
        environment: this.environment,
        providers: this.providers,
        defaultTags: this.defaultTags,
      },
      merged,
    );
  }

  /**
   * Dispatches a log event to all providers with merged runtime context.
   * @private
   * @param {LogLevel} level - Log severity level.
   * @param {string} message - Message to emit.
   * @param {LogOptions} [options={}] - Optional tags, context, and error details.
   * @returns {void}
   */
  private dispatch(
    level: LogLevel,
    message: string,
    options: LogOptions = {},
  ): void {
    const runtimeContext = ContextManager.mergeWithContext(this.scope);

    const tags = {
      ...runtimeContext.tags,
      ...options.tags,
    };

    const baseContext = {
      ...options.context,
      ...(runtimeContext.domain ? { domain: runtimeContext.domain } : {}),
      ...(runtimeContext.user ? { user: runtimeContext.user } : {}),
      ...(runtimeContext.instrumentation
        ? { instrumentation: runtimeContext.instrumentation }
        : {}),
    };

    const event: LogEvent = {
      level,
      message,
      timestamp: new Date(),
      domain: options.domain ?? runtimeContext.domain,
      impact: options.impact ?? runtimeContext.impact,
      tags,
      context: baseContext,
      error: options.error,
      instrumentation: runtimeContext.instrumentation,
      runtime: {
        environment: this.environment,
      },
    };

    for (const provider of this.providers) {
      provider.log?.(event);
    }
  }
}
