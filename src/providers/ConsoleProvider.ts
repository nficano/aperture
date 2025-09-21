import type {
  ApertureProvider,
  ConsoleProviderOptions,
  LogEvent,
  MetricEvent,
  ProviderContext,
} from "../types/index.js";

type ConsoleLike = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
};

const LEVEL_COLORS: Record<string, string> = {
  debug: "\x1B[38;5;240m",
  info: "\x1B[32m",
  warn: "\x1B[33m",
  error: "\x1B[31m",
};

const RESET = "\x1B[0m";

const consoleOutput =
  (globalThis as unknown as { console?: ConsoleLike }).console ??
  ({
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    info: () => undefined,
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

    parts.push(`${color}[${event.level.toUpperCase()}]${reset}`);
    parts.push(event.message);

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
    if (this.environment === "production") {
      consoleOutput.log(
        JSON.stringify({ type: "metric", ...this.redact(event) }),
      );
      return;
    }

    const color = this.options.enableColors === false ? "" : "\x1B[36m";
    const reset = color ? RESET : "";
    const parts: string[] = [];

    parts.push(`${color}[METRIC]${reset}`);
    parts.push(`${event.name}=${event.value ?? "n/a"}`);

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
    if (!redactKeys.length) return payload;
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
