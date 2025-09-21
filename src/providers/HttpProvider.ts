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
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<unknown>;

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
  private buffer: Array<Record<string, unknown>> = [];
  private timer: TimerHandle | null = null;

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

    const scheduleInterval = timers.setInterval;

    if (options.flushIntervalMs && scheduleInterval) {
      const interval = scheduleInterval(() => {
        this.flush().catch(() => undefined);
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
    this.enqueue(event);
  }

  /**
   * Queues a metric event for batched delivery.
   * @param {MetricEvent} event - Metric event to enqueue.
   * @returns {void}
   */
  metric(event: MetricEvent): void {
    this.enqueue(event);
  }

  /**
   * Flushes the pending buffer to the configured HTTP endpoint.
   * @returns {Promise<void>} Resolves when the network request completes or the buffer is empty.
   * @throws {Error} When no global fetch implementation is available.
   */
  async flush(): Promise<void> {
    if (!this.buffer.length) return;

    const payload = this.buffer.splice(0, this.buffer.length);

    try {
      if (!httpFetch) {
        throw new Error("global fetch implementation not available");
      }

      await httpFetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    } catch (error) {
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
    this.buffer.push(serialized);

    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => undefined);
    }
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
