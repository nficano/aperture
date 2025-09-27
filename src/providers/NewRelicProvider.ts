import { HttpProvider } from "./HttpProvider.js";
import type {
  ApertureProvider,
  LogEvent,
  MetricEvent,
  NewRelicProviderOptions,
  TraceEvent,
} from "../types/index.js";

export type { NewRelicProviderOptions } from "../types/index.js";

/**
 * Adapts Aperture events to New Relic's log and metric ingestion APIs using dedicated transports.
 */
export class NewRelicProvider implements ApertureProvider {
  readonly name = "newrelic";
  private readonly logTransport: HttpProvider;
  private readonly metricTransport: HttpProvider;

  /**
   * Creates a New Relic provider with the given license key and options.
   * @param {NewRelicProviderOptions} options - License key, service metadata, and batching configuration.
   */
  constructor(options: NewRelicProviderOptions) {
    const debug = options.debug ?? false;
    const logEndpoint =
      options.logEndpoint ??
      options.endpoint ??
      "https://log-api.newrelic.com/log/v1";
    this.logTransport = new HttpProvider({
      name: "newrelic-log",
      endpoint: logEndpoint,
      headers: {
        "content-type": "application/json",
        "x-license-key": options.licenseKey,
      },
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      transform: (event) =>
        NewRelicProvider.transformLog(
          event as LogEvent | TraceEvent,
          options,
        ),
      debug,
    });

    const metricEndpoint =
      options.metricEndpoint ?? "https://metric-api.newrelic.com/metric/v1";
    this.metricTransport = new HttpProvider({
      name: "newrelic-metric",
      endpoint: metricEndpoint,
      headers: {
        "content-type": "application/json",
        "api-key": options.metricApiKey ?? options.licenseKey,
      },
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      transform: (event) =>
        NewRelicProvider.transformMetric(event as MetricEvent, options),
      debug,
    });
  }

  /**
   * Forwards a log event to New Relic's log API via the buffered HTTP transport.
   * @param {LogEvent} event - Log event to enqueue.
   * @returns {void}
   */
  log(event: LogEvent): void {
    this.logTransport.log(event);
  }

  /**
   * Forwards a metric event to New Relic's metric API via the buffered HTTP transport.
   * @param {MetricEvent} event - Metric event to enqueue.
   * @returns {void}
   */
  metric(event: MetricEvent): void {
    this.metricTransport.metric(event);
  }

  trace(event: TraceEvent): void {
    this.logTransport.trace(event);
  }

  /**
   * Flushes both log and metric transports.
   * @returns {Promise<void>} Resolves when both transports are flushed.
   */
  async flush(): Promise<void> {
    await Promise.all([
      this.logTransport.flush(),
      this.metricTransport.flush(),
    ]);
  }

  /**
   * Shuts down both transports, ensuring pending events are delivered.
   * @returns {Promise<void>} Resolves when shutdown completes.
   */
  async shutdown(): Promise<void> {
    await Promise.all([
      this.logTransport.shutdown(),
      this.metricTransport.shutdown(),
    ]);
  }

  /**
   * Transforms a log event into the payload expected by New Relic's log API.
   * @param {LogEvent} event - Event to transform.
   * @param {NewRelicProviderOptions} options - Provider options supplying defaults.
   * @returns {Record<string, unknown>} New Relic-compatible log payload.
   */
  private static transformLog(
    event: LogEvent | TraceEvent,
    options: NewRelicProviderOptions
  ): Record<string, unknown> {
    if ("traceId" in event) {
      const timestamp = NewRelicProvider.normalizeTimestamp(
        event.endTime ?? event.startTime,
      );
      const attributes = NewRelicProvider.buildAttributes(options, {
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        context: {
          ...event.context,
          traceId: event.traceId,
          spanId: event.spanId,
          parentSpanId: event.parentSpanId,
          status: event.status,
          attributes: event.attributes,
        },
        instrumentation: event.instrumentation,
      });

      attributes["log.level"] = event.status === "error" ? "error" : "info";

      return {
        message: `trace:${event.name}`,
        attributes,
        ...(timestamp !== undefined && timestamp !== null ? { timestamp } : {}),
      };
    }

    const logEvent = event as LogEvent;
    const timestamp = NewRelicProvider.normalizeTimestamp(logEvent.timestamp);
    const attributes = NewRelicProvider.buildAttributes(options, {
      domain: logEvent.domain,
      impact: logEvent.impact,
      tags: logEvent.tags,
      context: logEvent.context,
      instrumentation: logEvent.instrumentation,
      runtime: logEvent.runtime,
    });

    attributes["log.level"] = logEvent.level;

    if (logEvent.error) {
      attributes["error.message"] = logEvent.error.message;
      attributes["error.stack"] = logEvent.error.stack;
    }

    return {
      message: logEvent.message,
      attributes,
      ...(timestamp !== undefined && timestamp !== null ? { timestamp } : {}),
    };
  }

  /**
   * Transforms a metric event into the payload expected by New Relic's metric API.
   * @param {MetricEvent} event - Event to transform.
   * @param {NewRelicProviderOptions} options - Provider options supplying defaults.
   * @returns {Record<string, unknown>} New Relic-compatible metric payload.
   */
  private static transformMetric(
    event: MetricEvent,
    options: NewRelicProviderOptions
  ): Record<string, unknown> {
    const timestamp = NewRelicProvider.normalizeTimestamp(event.timestamp);
    const attributes = NewRelicProvider.buildAttributes(options, {
      domain: event.domain,
      impact: event.impact,
      tags: event.tags,
      context: event.context,
      instrumentation: event.instrumentation,
    });

    if (event.unit) {
      attributes.unit = event.unit;
    }

    return {
      metrics: [
        {
          name: event.name,
          type: NewRelicProvider.resolveMetricType(event.unit),
          value: event.value ?? 0,
          ...(timestamp !== undefined && timestamp !== null
            ? { timestamp }
            : {}),
          attributes,
        },
      ],
    };
  }

  /**
   * Resolves a New Relic metric type hint from the provided unit.
   * @param {MetricEvent['unit'] | undefined} unit - Declared unit for the metric.
   * @returns {string} Metric type accepted by New Relic.
   */
  private static resolveMetricType(
    unit: MetricEvent["unit"] | undefined
  ): string {
    if (!unit) return "gauge";
    const normalized = String(unit).toLowerCase();
    if (
      normalized === "count" ||
      normalized === "requests" ||
      normalized === "operations"
    ) {
      return "count";
    }
    return "gauge";
  }

  /**
   * Builds a New Relic attributes object with service metadata and event context.
   * @param {NewRelicProviderOptions} options - Provider options supplying defaults.
   * @param {Record<string, unknown>} context - Event-specific context to merge.
   * @returns {Record<string, unknown>} Combined attributes map.
   */
  private static buildAttributes(
    options: NewRelicProviderOptions,
    context: {
      domain?: LogEvent["domain"] | MetricEvent["domain"];
      impact?: LogEvent["impact"] | MetricEvent["impact"];
      tags?: LogEvent["tags"] | MetricEvent["tags"];
      context?: LogEvent["context"] | MetricEvent["context"];
      instrumentation?:
        | LogEvent["instrumentation"]
        | MetricEvent["instrumentation"];
      runtime?: LogEvent["runtime"];
    }
  ): Record<string, unknown> {
    const attributes: Record<string, unknown> = {
      "service.name": options.service,
    };

    if (options.environment) {
      attributes.environment = options.environment;
    }

    if (context.domain) {
      attributes.domain = context.domain;
    }

    if (context.impact) {
      attributes.impact = context.impact;
    }

    if (context.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        attributes[key] = value;
      }
    }

    if (context.context) {
      attributes.context = context.context;
    }

    if (context.instrumentation) {
      attributes.instrumentation = context.instrumentation;
    }

    if (context.runtime) {
      attributes.runtime = context.runtime;
    }

    return attributes;
  }

  /**
   * Normalizes event timestamps to epoch milliseconds when possible.
   * @param {Date | number | string} timestamp - Event timestamp value.
   * @returns {number | string | undefined} Epoch milliseconds or the original value when conversion is not possible.
   */
  private static normalizeTimestamp(
    timestamp: LogEvent["timestamp"] | MetricEvent["timestamp"]
  ): number | string | undefined {
    if (timestamp instanceof Date) {
      return timestamp.getTime();
    }

    const value = timestamp as unknown;
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }

    return undefined;
  }
}
