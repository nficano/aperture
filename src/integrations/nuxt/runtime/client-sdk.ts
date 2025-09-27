import type {
  TelemetryEnvelope,
  TelemetryKind,
  Severity,
} from "../../../tunnel/types.js";

type GetToken = () => Promise<string | null | undefined> | string | null | undefined;

export interface ClientOptions {
  url: string;
  getToken?: GetToken;
  batchSize?: number;
  flushIntervalMs?: number;
  debug?: boolean;
}

export class ApertureClient {
  private readonly url: string;
  private readonly getToken?: GetToken;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly debug: boolean;
  private queue: TelemetryEnvelope[] = [];
  private timer: any = null;

  constructor(options: ClientOptions) {
    this.url = options.url;
    this.getToken = options.getToken;
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.debug = !!options.debug;

    const g = globalThis as any;
    if (typeof g.addEventListener === "function") {
      g.addEventListener("beforeunload", () => {
        void this.flush({ useBeacon: true });
      });
    }
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.flushIntervalMs);
  }

  private push(item: TelemetryEnvelope) {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else {
      this.schedule();
    }
  }

  private base<K extends TelemetryKind>(kind: K) {
    return {
      schema: "aperture.v1" as const,
      kind,
      ts: Date.now(),
    } as const;
  }

  capture(event: TelemetryEnvelope) {
    this.push(event);
  }

  log(level: Severity, message: string, data?: Record<string, unknown>, tags?: Record<string, any>) {
    this.push({ ...this.base("log"), level, message, data, tags });
  }

  error(error: unknown, ctx?: { message?: string; data?: Record<string, unknown>; tags?: Record<string, any> }) {
    const e = normalizeError(error);
    this.push({ ...this.base("error"), message: ctx?.message ?? e.message, name: e.name, stack: e.stack, data: ctx?.data, tags: ctx?.tags });
  }

  metric(name: string, value?: number, unit?: string, tags?: Record<string, any>) {
    this.push({ ...this.base("metric"), name, value, unit, tags });
  }

  trace(span: {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    startTime: number;
    endTime?: number;
    status?: "ok" | "error";
    attributes?: Record<string, string | number | boolean | null>;
    tags?: Record<string, any>;
  }) {
    this.push({ ...this.base("trace"), ...span });
  }

  rum(data: {
    webVitals?: { cls?: number; lcp?: number; fid?: number; inp?: number; ttfb?: number; fcp?: number };
    navTiming?: Record<string, number>;
    url?: string;
    tags?: Record<string, any>;
  }) {
    this.push({ ...this.base("rum"), ...data });
  }

  async flush(opts?: { useBeacon?: boolean }) {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    const body = JSON.stringify(batch);
    const token = await Promise.resolve(this.getToken?.());

    const g = globalThis as any;
    if (opts?.useBeacon && g.navigator && typeof g.navigator.sendBeacon === "function") {
      const BlobCtor = g.Blob || (typeof Blob === 'undefined' ? null : Blob);
      const blob = BlobCtor ? new BlobCtor([body], { type: "application/json" }) : body;
      if (token) {
        // Beacon cannot set headers; include token in query param as last resort
        try {
          const origin = g.window?.location?.origin || undefined;
          const url = origin ? new URL(this.url, origin) : new URL(this.url);
          url.searchParams.set("token", token);
          g.navigator.sendBeacon(url.toString(), blob);
          return;
        } catch {
          g.navigator.sendBeacon(this.url, blob);
          return;
        }
      }
      g.navigator.sendBeacon(this.url, blob);
      return;
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;
    const ff = (g.fetch ?? fetch) as any;
    await ff(this.url, {
      method: "POST",
      headers,
      body,
    }).catch(() => {
      // put back on failure
      this.queue.unshift(...batch);
    });
  }
}

function normalizeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  if (typeof err === "string") return { name: "Error", message: err };
  return { name: "Error", message: "Unknown error" };
}
