import { HttpProvider } from "./HttpProvider.js";
import type {
  HttpProviderOptions,
  LogEvent,
  MetricEvent,
  NewRelicProviderOptions,
} from "../types/index.js";

export type { NewRelicProviderOptions } from "../types/index.js";

/**
 * Adapts Aperture events to New Relic's log ingestion API using the HTTP provider.
 * Also provides browser agent initialization for client-side monitoring.
 */
export class NewRelicProvider extends HttpProvider {
  /**
   * Creates a New Relic provider with the given license key and options.
   * @param {NewRelicProviderOptions} options - License key, service metadata, and batching configuration.
   */
  constructor(options: NewRelicProviderOptions) {
    const headers = {
      "content-type": "application/json",
      "x-license-key": options.licenseKey,
    };

    const httpOptions: HttpProviderOptions = {
      name: "newrelic",
      endpoint: options.endpoint ?? "https://log-api.newrelic.com/log/v1",
      headers,
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      transform: (event) => NewRelicProvider.transform(event, options),
    };

    super(httpOptions);
  }

  /**
   * Generates the browser agent initialization script for client-side monitoring.
   * @param {NewRelicProviderOptions} options - Provider options containing browser agent credentials.
   * @returns {string} HTML script tag for browser agent initialization.
   */
  static generateBrowserAgentScript(options: NewRelicProviderOptions): string {
    if (
      !options.accountID ||
      !options.trustKey ||
      !options.agentID ||
      !options.applicationID
    ) {
      throw new Error(
        "Browser agent requires accountID, trustKey, agentID, and applicationID"
      );
    }

    return `
<script type="text/javascript">
;window.NREUM||(NREUM={});NREUM.init={distributed_tracing:{enabled:true},performance:{capture_measures:true},privacy:{cookies_enabled:true},ajax:{deny_list:["bam.nr-data.net"]}};

;NREUM.loader_config={accountID:"${options.accountID}",trustKey:"${options.trustKey}",agentID:"${options.agentID}",licenseKey:"${options.licenseKey}",applicationID:"${options.applicationID}"};
;NREUM.info={beacon:"bam.nr-data.net",errorBeacon:"bam.nr-data.net",licenseKey:"${options.licenseKey}",applicationID:"${options.applicationID}",sa:1};
</script>
<script type="text/javascript" src="https://js-agent.newrelic.com/nr-loader-spa-1.297.1.min.js"></script>`;
  }

  /**
   * Transforms log or metric events into New Relic's payload format.
   * @param {LogEvent | MetricEvent} event - Event to transform.
   * @param {NewRelicProviderOptions} options - Provider options supplying defaults.
   * @returns {Record<string, unknown>} New Relic-compatible payload.
   */
  private static transform(
    event: LogEvent | MetricEvent,
    options: NewRelicProviderOptions
  ): Record<string, unknown> {
    const common = {
      service: options.service,
      environment: options.environment,
      timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : event.timestamp,
      domain: event.domain,
      impact: event.impact,
      tags: event.tags,
    };

    if ("message" in event) {
      return {
        ...common,
        level: event.level,
        message: event.message,
        context: event.context,
        instrumentation: event.instrumentation,
        runtime: event.runtime,
        error: event.error
          ? {
              message: event.error.message,
              stack: event.error.stack,
            }
          : undefined,
      };
    }

    return {
      ...common,
      type: "metric",
      name: event.name,
      value: event.value,
      unit: event.unit,
      instrumentation: event.instrumentation,
    };
  }
}
