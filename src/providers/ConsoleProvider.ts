import type {
  ApertureProvider,
  ConsoleProviderOptions,
  LogEvent,
  MetricEvent,
  ProviderContext,
  TraceEvent,
} from "../types/index.js";

type ConsoleLike = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
};

const LEVEL_COLORS: Record<string, string> = {
  debug: "\u001B[38;5;240m",
  info: "\u001B[32m",
  warn: "\u001B[33m",
  error: "\u001B[31m",
};

const RESET = "\u001B[0m";

const consoleOutput =
  (globalThis as unknown as { console?: ConsoleLike }).console ??
  ({
    log: () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  } satisfies ConsoleLike);
/**
 * Renders arbitrary values into console-friendly strings.
 * @param {unknown} value - Value to render for console output.
 * @param {boolean} useColors - Whether pretty JSON formatting should be applied.
 * @returns {string} String representation suitable for logs.
 */
const renderValue = (value: unknown, useColors: boolean): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    const serialized = JSON.stringify(value, null, useColors ? 2 : 0);
    if (serialized) {
      return serialized;
    }
  } catch {
    // ignore JSON failures and fall back to string conversion
  }

  return String(value);
};

export type { ConsoleProviderOptions } from "../types/index.js";

/**
 * Provider that formats log and metric events to standard output.
 */
export class ConsoleProvider implements ApertureProvider {
  name = "console";
  private environment: ProviderContext["environment"] = "development";
  private readonly options: ConsoleProviderOptions;

  /**
   * Creates a console provider with formatting and redaction options.
   * @param {ConsoleProviderOptions} [options={}] - Console formatting and redaction preferences.
   */
  constructor(options: ConsoleProviderOptions = {}) {
    this.options = options;
  }

  /**
   * Captures the runtime environment for conditional formatting.
   * @param {ProviderContext} context - Provider setup context supplied by Aperture.
   * @returns {void}
   */
  setup(context: ProviderContext): void {
    this.environment = context.environment;
  }

  /**
   * Writes a log event to the console in either structured JSON or colorized text.
   * @param {LogEvent} event - Log event to render.
   * @returns {void}
   */
  log(event: LogEvent): void {
    if (this.options.debug) {
      consoleOutput.log(`[console] Debug - Log event received:`, {
        message: event.message,
        level: event.level,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        timestamp: event.timestamp,
      });
    }

    if (this.environment === "production") {
      // In production, emit structured JSON for aggregation.
      const payload = this.redact(event);
      consoleOutput.log(JSON.stringify(payload));
      return;
    }

    const color =
      this.options.enableColors === false
        ? ""
        : (LEVEL_COLORS[event.level] ?? "");
    const reset = color ? RESET : "";
    const parts: string[] = [];

    parts.push(`${color}[${event.level.toUpperCase()}]${reset}`, event.message);

    if (event.domain) {
      parts.push(`domain=${event.domain}`);
    }

    if (event.impact) {
      parts.push(`impact=${event.impact}`);
    }

    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(
        `tags=${renderValue(event.tags, this.options.enableColors !== false)}`,
      );
    }

    if (event.instrumentation) {
      parts.push(
        `instrument=${renderValue(event.instrumentation, this.options.enableColors !== false)}`,
      );
    }

    if (event.error) {
      parts.push(`error=${event.error.stack ?? event.error.message}`);
    }

    if (event.context && Object.keys(event.context).length > 0) {
      parts.push(
        `ctx=${renderValue(event.context, this.options.enableColors !== false)}`,
      );
    }

    consoleOutput.log(parts.join(" | "));
  }

  /**
   * Writes a metric event to the console in either structured JSON or colorized text.
   * @param {MetricEvent} event - Metric event to render.
   * @returns {void}
   */
  metric(event: MetricEvent): void {
    if (this.options.debug) {
      consoleOutput.log(`[console] Debug - Metric event received:`, {
        name: event.name,
        value: event.value,
        unit: event.unit,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        timestamp: event.timestamp,
      });
    }

    if (this.environment === "production") {
      consoleOutput.log(
        JSON.stringify({ type: "metric", ...this.redact(event) }),
      );
      return;
    }

    const color = this.options.enableColors === false ? "" : "\u001B[36m";
    const reset = color ? RESET : "";
    const parts: string[] = [];

    parts.push(`${color}[METRIC]${reset}`, `${event.name}=${event.value ?? "n/a"}`);

    if (event.domain) parts.push(`domain=${event.domain}`);
    if (event.impact) parts.push(`impact=${event.impact}`);
    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(
        `tags=${renderValue(event.tags, this.options.enableColors !== false)}`,
      );
    }

    consoleOutput.log(parts.join(" | "));
  }

  /**
   * Writes a trace event to the console with trace-specific formatting.
   * @param {TraceEvent} event - Trace event to render.
   * @returns {void}
   */
  trace(event: TraceEvent): void {
    if (this.options.debug) {
      consoleOutput.log(`[console] Debug - Trace event received:`, {
        name: event.name,
        traceId: event.traceId,
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        status: event.status,
        attributes: event.attributes,
      });
    }

    if (this.environment === "production") {
      const payload = {
        ...event,
        startTime:
          event.startTime instanceof Date
            ? event.startTime.toISOString()
            : event.startTime,
        endTime:
          event.endTime instanceof Date
            ? event.endTime.toISOString()
            : event.endTime,
        type: "trace",
      };
      consoleOutput.log(JSON.stringify(this.redact(payload)));
      return;
    }

    const color = this.options.enableColors === false ? "" : "\u001B[35m";
    const reset = color ? RESET : "";
    const parts: string[] = [];

    parts.push(`${color}[TRACE]${reset}`, event.name, `traceId=${event.traceId}`);

    if (event.spanId) parts.push(`spanId=${event.spanId}`);
    if (event.parentSpanId) parts.push(`parent=${event.parentSpanId}`);
    if (event.status) parts.push(`status=${event.status}`);
    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(
        `tags=${renderValue(event.tags, this.options.enableColors !== false)}`,
      );
    }
    if (event.attributes && Object.keys(event.attributes).length > 0) {
      parts.push(
        `attrs=${renderValue(
          event.attributes,
          this.options.enableColors !== false,
        )}`,
      );
    }

    consoleOutput.log(parts.join(" | "));
  }

  /**
   * Flush lifecycle hook; no action required for console output.
   * @returns {void}
   */
  flush(): void {
    // No-op for console provider.
  }

  /**
   * Shutdown lifecycle hook; no action required for console output.
   * @returns {void}
   */
  shutdown(): void {
    // No-op for console provider.
  }

  /**
   * Redacts configured keys from structured payloads.
   * @template T
   * @param {T} payload - Payload potentially containing sensitive keys.
   * @returns {T} Sanitized payload with configured keys redacted.
   */
  private redact<T>(payload: T): T {
    const redactKeys = this.options.redactKeys ?? [];
    if (redactKeys.length === 0) return payload;
    if (payload === null || typeof payload !== "object") {
      return payload;
    }

    const clone: Record<string, unknown> = {
      ...(payload as Record<string, unknown>),
    };
    for (const key of redactKeys) {
      if (key in clone) {
        clone[key] = "[REDACTED]";
      }
    }

    return clone as T;
  }
}
