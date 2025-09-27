import { HttpProvider } from "./HttpProvider.js";
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
 * Also provides browser RUM initialization for client-side monitoring.
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
      debug: options.debug,
    };

    super(httpOptions);
  }

  /**
   * Generates the browser RUM initialization script for client-side monitoring.
   * @param {DatadogProviderOptions} options - Provider options containing RUM credentials.
   * @returns {string} HTML script tag for Datadog RUM initialization.
   */
  static generateBrowserRumScript(options: DatadogProviderOptions): string {
    if (!options.rumApplicationId || !options.rumClientToken) {
      throw new Error(
        "Browser RUM requires rumApplicationId and rumClientToken"
      );
    }

    const site = options.site || "datadoghq.com";
    const env = options.environment || "production";
    const service = options.service;
    const tunnelEndpoint = options.rumTunnelEndpoint || "/api/datadog/rum";

    if (options.debug) {
      // eslint-disable-next-line no-console
      console.debug("[datadog] Generating browser RUM script with config:", {
        applicationId: options.rumApplicationId,
        clientToken: options.rumClientToken?.slice(0, 8) + "...",
        site,
        service,
        environment: env,
        tunnelRum: options.tunnelRum,
        tunnelEndpoint,
      });
    }

    return options.tunnelRum
      ? // Server-side tunneling: Send RUM data to our server endpoint
        `
<script>
(function(h,o,u,n,d) {
  h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
  d=o.createElement(u);d.async=1;d.src=n
  n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','https://www.${site}/browser-sdk/v3/datadog-rum.js','DD_RUM')
DD_RUM.onReady(function() {
  DD_RUM.init({
    applicationId: '${options.rumApplicationId}',
    clientToken: '${options.rumClientToken}',
    site: '${site}',
    service: '${service}',
    env: '${env}',
    version: '1.0.0',
    sampleRate: 100,
    trackInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input',
    // Override the default intake endpoint to tunnel through our server
    intake: '${tunnelEndpoint}'
  });
})
</script>`
      : // Direct connection: Send RUM data directly to Datadog
        `
<script>
(function(h,o,u,n,d) {
  h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
  d=o.createElement(u);d.async=1;d.src=n
  n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','https://www.${site}/browser-sdk/v3/datadog-rum.js','DD_RUM')
DD_RUM.onReady(function() {
  DD_RUM.init({
    applicationId: '${options.rumApplicationId}',
    clientToken: '${options.rumClientToken}',
    site: '${site}',
    service: '${service}',
    env: '${env}',
    version: '1.0.0',
    sampleRate: 100,
    trackInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input'
  });
})
</script>`;
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
