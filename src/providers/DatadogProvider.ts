import { HttpProvider } from "./HttpProvider.js";
import { DEFAULT_DATADOG_REGION, resolveDatadogRegion } from "./regions.js";
import type {
  DatadogProviderOptions,
  HttpProviderOptions,
  LogEvent,
  MetricEvent,
  TraceEvent,
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
    const region = options.region?.toLowerCase();
    const regionConfig =
      resolveDatadogRegion(region) ??
      resolveDatadogRegion(DEFAULT_DATADOG_REGION);
    const resolvedOptions: DatadogProviderOptions = {
      ...options,
      ...(region ? { region } : {}),
    };

    const headers = {
      "content-type": "application/json",
      "dd-api-key": resolvedOptions.apiKey,
    };

    const httpOptions: HttpProviderOptions = {
      name: "datadog",
      endpoint:
        resolvedOptions.endpoint ?? regionConfig?.log ??
        "https://http-intake.logs.datadoghq.com/api/v2/logs",
      headers,
      batchSize: resolvedOptions.batchSize,
      flushIntervalMs: resolvedOptions.flushIntervalMs,
      transform: (event) => DatadogProvider.transform(event, resolvedOptions),
      debug: resolvedOptions.debug,
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
    event: LogEvent | MetricEvent | TraceEvent,
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

    const attributes: Record<string, unknown> = {
      ...event.context,
      instrumentation: event.instrumentation,
    };

    if ("runtime" in event) {
      attributes.runtime = event.runtime;
    }

    if ("value" in event) {
      attributes.value = event.value;
      attributes.unit = (event as MetricEvent).unit;
    }

    if ("traceId" in event) {
      attributes.trace = {
        traceId: event.traceId,
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        status: event.status,
        startTime: event.startTime,
        endTime: event.endTime,
        attributes: event.attributes,
      };
    }

    const payload: DatadogPayload = {
      ddsource: options.ddsource ?? "aperture",
      service: options.service,
      ddtags,
      level: "level" in event ? event.level : "info",
      environment: options.environment,
      message:
        "message" in event
          ? event.message
          : "traceId" in event
          ? `trace:${event.name}`
          : event.name,
      timestamp:
        "timestamp" in event && event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : "timestamp" in event && event.timestamp
          ? event.timestamp
          : "endTime" in event && event.endTime instanceof Date
          ? event.endTime.toISOString()
          : "endTime" in event && event.endTime
          ? event.endTime
          : "startTime" in event && event.startTime instanceof Date
          ? event.startTime.toISOString()
          : "startTime" in event && event.startTime
          ? event.startTime
          : new Date().toISOString(),
      attributes,
    };

    if ("error" in event && event.error) {
      attributes.error = {
        message: event.error.message,
        stack: event.error.stack,
      };
    }

    return payload;
  }
}
