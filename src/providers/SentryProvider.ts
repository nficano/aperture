import type {
  ApertureProvider,
  LogEvent,
  MetricEvent,
  ProviderContext,
  SentryProviderOptions,
} from "../types/index.js";

type Logger = {
  warn: (...args: unknown[]) => void;
};

const NOOP_LOGGER: Logger = {
  warn: () => undefined,
};

export type { SentryProviderOptions } from "../types/index.js";

/**
 * Forwards log and metric events to Sentry using the Node SDK.
 */
export class SentryProvider implements ApertureProvider {
  name = "sentry";
  private sentry: any = null;
  private readonly options: SentryProviderOptions;
  private readonly logger: Logger =
    (globalThis as unknown as { console?: Logger }).console ?? NOOP_LOGGER;

  /**
   * Creates a Sentry provider with initialization overrides.
   * @param {SentryProviderOptions} [options={}] - Sentry DSN, release, and sampling configuration.
   */
  constructor(options: SentryProviderOptions = {}) {
    this.options = options;
  }

  /**
   * Lazily imports and initializes the Sentry SDK.
   * @param {ProviderContext} context - Runtime environment and release metadata from Aperture.
   * @returns {Promise<void>} Resolves once initialization completes or fails.
   */
  async setup(context: ProviderContext): Promise<void> {
    try {
      const sentryModule: any = await import("@sentry/node");
      this.sentry = sentryModule;
      if (!sentryModule.isInitialized?.()) {
        sentryModule.init({
          dsn: this.options.dsn,
          environment: this.options.environment ?? context.environment,
          release: this.options.release ?? context.release,
          sampleRate: this.options.sampleRate ?? 1.0,
          tracesSampleRate: this.options.tracesSampleRate ?? 0.1,
          attachStacktrace: this.options.attachStacktrace ?? true,
        });
      }
    } catch (error) {
      this.logger.warn(
        "[Aperture][Sentry] @sentry/node is not available. Provider disabled.",
        error,
      );
      this.sentry = null;
    }
  }

  /**
   * Sends a log event to Sentry as either a message or exception.
   * @param {LogEvent} event - Log event to forward.
   * @returns {void}
   */
  log(event: LogEvent): void {
    if (!this.sentry) return;

    const payload = {
      level: this.mapLevel(event.level),
      tags: {
        ...(event.tags ?? {}),
        ...(event.domain ? { domain: event.domain } : {}),
        ...(event.impact ? { impact: event.impact } : {}),
      },
      contexts: {
        instrumentation: event.instrumentation,
        runtime: event.runtime,
        data: event.context,
      },
    };

    if (event.error) {
      this.sentry.captureException(event.error, payload);
    } else {
      this.sentry.captureMessage(event.message, payload);
    }
  }

  /**
   * Sends a metric event to Sentry using `captureEvent`.
   * @param {MetricEvent} event - Metric event to forward.
   * @returns {void}
   */
  metric(event: MetricEvent): void {
    if (!this.sentry) return;

    const timestampSeconds =
      event.timestamp instanceof Date
        ? Math.floor(event.timestamp.getTime() / 1000)
        : Math.floor(Date.now() / 1000);

    this.sentry.captureEvent({
      message: event.name,
      level: "info",
      timestamp: timestampSeconds,
      tags: {
        ...(event.tags ?? {}),
        ...(event.domain ? { domain: event.domain } : {}),
        ...(event.impact ? { impact: event.impact } : {}),
      },
      extra: {
        value: event.value,
        unit: event.unit,
        instrumentation: event.instrumentation,
      },
    });
  }

  /**
   * Flushes any buffered events within the Sentry SDK.
   * @returns {Promise<void>} Resolves once the flush completes.
   */
  async flush(): Promise<void> {
    await this.sentry?.flush?.(2000);
  }

  /**
   * Closes the Sentry transport and clears the local reference.
   * @returns {Promise<void>} Resolves once shutdown completes.
   */
  async shutdown(): Promise<void> {
    await this.sentry?.close?.(2000);
    this.sentry = null;
  }

  /**
   * Maps Aperture log levels to Sentry severity identifiers.
   * @param {LogEvent['level']} level - Aperture log level.
   * @returns {string} Corresponding Sentry severity string.
   */
  private mapLevel(level: LogEvent["level"]): string {
    switch (level) {
      case "debug":
        return "debug";
      case "info":
        return "info";
      case "warn":
        return "warning";
      case "error":
      default:
        return "error";
    }
  }
}
