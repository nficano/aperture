import type {
  ApertureProvider,
  HttpProviderOptions,
  LogEvent,
  MetricEvent,
} from "../types/index.js";

export type { HttpProviderOptions } from "../types/index.js";

type TimerHandle = { unref?: () => void } | number | undefined;

type TimerControls = {
  setInterval?: (handler: () => void, timeout?: number) => TimerHandle;
  clearInterval?: (handle: TimerHandle) => void;
};

const timers = globalThis as TimerControls;
const scheduleTimeout = (
  globalThis as {
    setTimeout?: (handler: () => void, timeout?: number) => TimerHandle;
  }
).setTimeout;

/**
 * Calls `unref` on a timer handle when the method exists.
 * @param {TimerHandle | null} handle - Timer handle returned from setInterval.
 * @returns {void}
 */
const unrefTimer = (handle: TimerHandle | null): void => {
  if (
    handle &&
    typeof handle === "object" &&
    "unref" in handle &&
    typeof handle.unref === "function"
  ) {
    handle.unref();
  }
};

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<unknown>;

type FetchResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: { get(name: string): string | null };
  text?: () => Promise<string>;
};

const httpFetch = (globalThis as { fetch?: FetchLike }).fetch;

/**
 * Buffered HTTP provider that batches log and metric payloads to a remote endpoint.
 */
export class HttpProvider implements ApertureProvider {
  readonly name: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly transform?: HttpProviderOptions["transform"];
  private readonly onError?: HttpProviderOptions["onError"];
  private readonly batchSize: number;
  private readonly debug: boolean;
  private readonly hasInterval: boolean;
  private buffer: Array<Record<string, unknown>> = [];
  private timer: TimerHandle | null = null;
  private pendingImmediateFlush = false;

  /**
   * Creates a new HTTP provider with batching and optional transforms.
   * @param {HttpProviderOptions} options - Endpoint configuration, headers, batching, and hooks.
   */
  constructor(options: HttpProviderOptions) {
    this.name = options.name;
    this.endpoint = options.endpoint;
    this.headers = options.headers ?? { "content-type": "application/json" };
    this.batchSize = options.batchSize ?? 20;
    this.transform = options.transform;
    this.onError = options.onError;
    this.debug = options.debug ?? false;

    const scheduleInterval = timers.setInterval;
    this.hasInterval = Boolean(options.flushIntervalMs && scheduleInterval);

    if (this.hasInterval) {
      const interval = scheduleInterval?.(() => {
        this.flush().catch(() => {});
      }, options.flushIntervalMs);
      unrefTimer(interval ?? null);
      this.timer = interval ?? null;
    }
  }

  /**
   * Queues a log event for batched delivery.
   * @param {LogEvent} event - Log event to enqueue.
   * @returns {void}
   */
  log(event: LogEvent): void {
    const verbose =
      this.debug || this.name === "datadog" || this.name.includes("newrelic");
    if (verbose) {
      console.log(`[${this.name}] log() called`, {
        message: event.message,
        level: event.level,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        bufferLength: this.buffer.length,
      });
    }
    this.enqueue(event);
  }

  /**
   * Queues a metric event for batched delivery.
   * @param {MetricEvent} event - Metric event to enqueue.
   * @returns {void}
   */
  metric(event: MetricEvent): void {
    const verbose =
      this.debug || this.name === "datadog" || this.name.includes("newrelic");
    if (verbose) {
      console.log(`[${this.name}] metric() called`, {
        name: event.name,
        value: event.value,
        unit: event.unit,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        bufferLength: this.buffer.length,
      });
    }
    this.enqueue(event);
  }

  /**
   * Flushes the pending buffer to the configured HTTP endpoint.
   * @returns {Promise<void>} Resolves when the network request completes or the buffer is empty.
   * @throws {Error} When no global fetch implementation is available.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const payload = this.buffer.splice(0);
    const shouldLogVerbose =
      this.debug || this.name === "datadog" || this.name.includes("newrelic");

    if (this.debug) {
      console.log(
        `[${this.name}] Flushing ${payload.length} events to ${this.endpoint}`
      );
    }

    if (shouldLogVerbose) {
      console.log(`[${this.name}] Request payload`, {
        endpoint: this.endpoint,
        headers: this.headers,
        size: payload.length,
        body: payload,
      });
    }

    try {
      if (!httpFetch) {
        throw new Error("global fetch implementation not available");
      }

      const response = (await httpFetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      })) as FetchResponse | undefined;

      if (shouldLogVerbose) {
        let responseBody: string | undefined;
        if (typeof response?.text === "function") {
          try {
            responseBody = await response.text();
          } catch {}
        }

        console.log(`[${this.name}] Response`, {
          status: response?.status,
          statusText: response?.statusText,
          ok: response?.ok,
          body: responseBody,
        });
      }

      if (this.debug) {
        console.log(
          `[${this.name}] Successfully sent ${payload.length} events`
        );
      }
    } catch (error) {
      if (this.debug) {
        console.error(`[${this.name}] Failed to send events:`, error);
      }
      this.onError?.(error);
    }
  }

  /**
   * Clears any background interval and flushes remaining events.
   * @returns {Promise<void>} Resolves when timers are cleared and the buffer is flushed.
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      timers.clearInterval?.(this.timer);
      this.timer = null;
    }

    await this.flush();
  }

  /**
   * Serializes and stores a log or metric event in the local buffer.
   * @param {LogEvent | MetricEvent} event - Event to enqueue.
   * @returns {void}
   */
  private enqueue(event: LogEvent | MetricEvent): void {
    const serialized = this.transform?.(event) ?? this.serialize(event);
    const verbose =
      this.debug || this.name === "datadog" || this.name.includes("newrelic");
    if (verbose) {
      console.log(`[${this.name}] enqueue`, {
        bufferLengthBefore: this.buffer.length,
        batchSize: this.batchSize,
      });
    }

    this.buffer.push(serialized);

    if (this.buffer.length >= this.batchSize) {
      if (verbose) {
        console.log(
          `[${this.name}] buffer reached batch size, flushing immediately`,
          {
            bufferLength: this.buffer.length,
          }
        );
      }
      this.flush().catch(() => {});
    } else {
      this.scheduleImmediateFlush();
    }
  }

  /**
   * Schedules an immediate flush on the next microtask when no interval is configured.
   * @returns {void}
   */
  private scheduleImmediateFlush(): void {
    if (
      this.hasInterval ||
      this.pendingImmediateFlush ||
      this.buffer.length === 0
    ) {
      return;
    }

    const verbose =
      this.debug || this.name === "datadog" || this.name.includes("newrelic");
    if (verbose) {
      console.log(`[${this.name}] scheduling immediate flush`, {
        bufferLength: this.buffer.length,
      });
    }

    this.pendingImmediateFlush = true;
    const runFlush = () => {
      this.pendingImmediateFlush = false;
      if (verbose) {
        console.log(`[${this.name}] running scheduled flush`, {
          bufferLength: this.buffer.length,
        });
      }
      this.flush().catch(() => {});
    };

    if (typeof queueMicrotask === "function") {
      queueMicrotask(runFlush);
      return;
    }

    if (typeof Promise === "function") {
      Promise.resolve()
        .then(runFlush)
        .catch(() => {});
      return;
    }

    scheduleTimeout?.(() => runFlush(), 0);
  }

  /**
   * Converts a log or metric event into a JSON-serializable payload.
   * @param {LogEvent | MetricEvent} payload - Event to serialize.
   * @returns {Record<string, unknown>} Plain object suitable for transmission.
   */
  private serialize(payload: LogEvent | MetricEvent): Record<string, unknown> {
    return {
      ...payload,
      timestamp:
        payload.timestamp instanceof Date
          ? payload.timestamp.toISOString()
          : payload.timestamp,
    };
  }
}
