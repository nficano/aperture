import type {
  TelemetryEnvelope,
  TelemetryKind,
  DispatchResult,
} from "./types.js";
import type { Aperture } from "../core/Aperture.js";

type BackoffState = {
  failures: number;
  openedAt?: number;
  state: "closed" | "open" | "half-open";
};

const now = () => Date.now();

const buildContext = (
  envelope: TelemetryEnvelope,
  extra?: Record<string, unknown>,
): Record<string, unknown> => {
  const context: Record<string, unknown> = {};

  if (envelope.instanceId) {
    context.instanceId = envelope.instanceId;
  }

  if (envelope.app && Object.keys(envelope.app).length > 0) {
    context.app = envelope.app;
  }

  if (envelope.ctx && Object.keys(envelope.ctx).length > 0) {
    context.runtime = envelope.ctx;
  }

  if ("data" in envelope && envelope.data) {
    context.data = envelope.data;
  }

  return {
    ...context,
    ...extra,
  };
};

/**
 * Simple in-memory fan-out dispatcher with retries, exponential backoff and circuit breaker.
 */
export class TunnelDispatcher {
  private readonly aperture: Aperture;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly circuitThreshold: number;
  private readonly circuitResetMs: number;
  private readonly backoff: Map<string, BackoffState> = new Map();

  constructor(
    aperture: Aperture,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      circuitThreshold?: number; // failures before open
      circuitResetMs?: number; // cooldown
    }
  ) {
    this.aperture = aperture;
    this.maxRetries = options?.maxRetries ?? 3;
    this.baseDelayMs = options?.baseDelayMs ?? 200;
    this.circuitThreshold = options?.circuitThreshold ?? 8;
    this.circuitResetMs = options?.circuitResetMs ?? 15_000;
  }

  async dispatch(envelope: TelemetryEnvelope): Promise<DispatchResult> {
    console.log("[TunnelDispatcher] dispatch", {
      kind: envelope.kind,
      tags: envelope.tags,
      level: (envelope as any).level,
      name: (envelope as any).name,
    });
    // sampling is managed upstream; here we only fan-out via aperture
    try {
      await this.send(envelope);
      return { accepted: 1, dropped: 0, errors: 0 };
    } catch {
      console.error("[TunnelDispatcher] dispatch failed", {
        kind: envelope.kind,
      });
      return { accepted: 0, dropped: 1, errors: 1 };
    }
  }

  private async send(envelope: TelemetryEnvelope): Promise<void> {
    // Circuit breaker for global path (per kind)
    const key = `kind:${envelope.kind}`;
    const state = this.backoff.get(key) ?? { failures: 0, state: "closed" };
    if (state.state === "open") {
      if (state.openedAt && now() - state.openedAt > this.circuitResetMs) {
        state.state = "half-open";
      } else {
        throw new Error("circuit-open");
      }
    }

    try {
      await this.trySend(envelope);
      // success -> reset
      this.backoff.set(key, { failures: 0, state: "closed" });
    } catch (error) {
      state.failures += 1;
      if (state.failures >= this.circuitThreshold) {
        state.state = "open";
        state.openedAt = now();
      }
      this.backoff.set(key, state);
      throw error;
    }
  }

  private async trySend(envelope: TelemetryEnvelope): Promise<void> {
    let attempt = 0;
    for (;;) {
      try {
        console.log("[TunnelDispatcher] trySend", {
          attempt,
          kind: envelope.kind,
        });
        this.route(envelope);
        return; // synchronous providers may throw; others fire-and-forget
      } catch (error) {
        attempt += 1;
        if (attempt > this.maxRetries) throw error;
        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private route(envelope: TelemetryEnvelope): void {
    const logger = this.aperture.getLogger({ tags: envelope.tags });
    const providers = this.aperture.listProviders?.() ?? [];
    console.log("[TunnelDispatcher] route", {
      kind: envelope.kind,
      providers,
    });

    switch (envelope.kind as TelemetryKind) {
      case "log": {
        console.log("[TunnelDispatcher] route log", {
          message: envelope.message,
          level: envelope.level,
        });
        const lvl = envelope.level;
        const msg = envelope.message;
        logger[lvl](msg, {
          context: buildContext(envelope),
          tags: envelope.tags,
        });
        break;
      }
      case "error": {
        console.log("[TunnelDispatcher] route error", {
          message: envelope.message,
          name: envelope.name,
        });
        const err = envelope.stack ? new Error(envelope.message) : undefined;
        if (err && envelope.stack) {
          err.stack = envelope.stack;
          if (envelope.name) err.name = envelope.name;
        }
        logger.error(envelope.message, {
          context: buildContext(envelope, {
            name: envelope.name,
            stack: envelope.stack,
          }),
          error: err,
          tags: envelope.tags,
        });
        break;
      }
      case "metric": {
        console.log("[TunnelDispatcher] route metric", {
          name: envelope.name,
          value: envelope.value,
          unit: envelope.unit,
        });
        this.aperture.emitMetric({
          name: envelope.name,
          value: envelope.value,
          unit: envelope.unit,
          timestamp: new Date(envelope.ts),
          tags: envelope.tags,
          impact: undefined,
          domain: undefined,
          instrumentation: undefined,
          context: buildContext(envelope),
        });
        break;
      }
      case "trace": {
        console.log("[TunnelDispatcher] route trace", {
          name: envelope.name,
          traceId: envelope.traceId,
        });
        this.aperture.emitTrace({
          name: envelope.name,
          traceId: envelope.traceId,
          spanId: envelope.spanId,
          parentSpanId: envelope.parentSpanId,
          status: envelope.status ?? "unknown",
          startTime: new Date(envelope.startTime),
          endTime: envelope.endTime ? new Date(envelope.endTime) : undefined,
          attributes: envelope.attributes,
          tags: envelope.tags,
          context: buildContext(envelope),
        });
        break;
      }
      case "rum": {
        console.log("[TunnelDispatcher] route rum", {
          url: envelope.url,
          webVitals: envelope.webVitals,
        });
        logger.info("rum", {
          context: buildContext(envelope, {
            webVitals: envelope.webVitals,
            navTiming: envelope.navTiming,
            url: envelope.url,
          }),
          tags: envelope.tags,
        });
        break;
      }
      case "custom": {
        console.log("[TunnelDispatcher] route custom", {
          event: envelope.event,
        });
        logger.info(`custom:${envelope.event}`, {
          context: buildContext(envelope),
          tags: envelope.tags,
        });
        break;
      }
    }
  }
}
