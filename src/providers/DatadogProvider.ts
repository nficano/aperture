import { HttpProvider } from "./HttpProvider.js";
import type {
  DatadogProviderOptions,
  HttpProviderOptions,
  LogEvent,
  MetricEvent,
} from "../types/index.js";

type DatadogPayload = Record<string, unknown>;

export type { DatadogProviderOptions } from "../types/index.js";

/**
 * Adapts Aperture events to Datadog's log intake API using the HTTP provider.
 */
export class DatadogProvider extends HttpProvider {
  /**
   * Creates a Datadog provider using the specified API credentials and options.
   * @param {DatadogProviderOptions} options - API key, service metadata, and batching configuration.
   */
  constructor(options: DatadogProviderOptions) {
    const headers = {
      "content-type": "application/json",
      "dd-api-key": options.apiKey,
    };

    const httpOptions: HttpProviderOptions = {
      name: "datadog",
      endpoint:
        options.endpoint ??
        "https://http-intake.logs.datadoghq.com/api/v2/logs",
      headers,
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      transform: (event) => DatadogProvider.transform(event, options),
    };

    super(httpOptions);
  }

  /**
   * Transforms log or metric events into Datadog's intake payload format.
   * @param {LogEvent | MetricEvent} event - Event to transform.
   * @param {DatadogProviderOptions} options - Provider options supplying defaults.
   * @returns {Record<string, unknown>} Datadog-compatible payload.
   */
  private static transform(
    event: LogEvent | MetricEvent,
    options: DatadogProviderOptions
  ): DatadogPayload {
    const tags = {
      ...options.tags,
      ...event.tags,
      ...(event.domain ? { domain: event.domain } : {}),
      ...(event.impact ? { impact: event.impact } : {}),
    };

    const ddtags = Object.entries(tags)
      .map(([key, value]) => `${key}:${String(value)}`)
      .join(",");

    const payload: DatadogPayload = {
      ddsource: options.ddsource ?? "aperture",
      service: options.service,
      ddtags,
      level: "level" in event ? event.level : "info",
      environment: options.environment,
      message: "message" in event ? event.message : event.name,
      timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : event.timestamp,
      attributes: {
        ...event.context,
        instrumentation: event.instrumentation,
        runtime: (event as LogEvent).runtime,
        value: "value" in event ? event.value : undefined,
        unit: "unit" in event ? event.unit : undefined,
      },
    };

    if ("error" in event && event.error) {
      payload.attributes = {
        ...(payload.attributes || {}),
        error: {
          message: event.error.message,
          stack: event.error.stack,
        },
      };
    }

    return payload;
  }
}
