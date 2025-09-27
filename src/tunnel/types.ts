export type TelemetryKind =
  | "log"
  | "error"
  | "metric"
  | "trace"
  | "rum"
  | "custom";

export type Severity = "debug" | "info" | "warn" | "error";

export interface BaseEnvelope {
  // Schema version for forward/backward compatibility
  schema: "aperture.v1";
  // Event kind discriminator
  kind: TelemetryKind;
  // Monotonic timestamp in ms
  ts: number;
  // Anonymous instance id for correlation (browser/app instance)
  instanceId?: string;
  // App/runtime metadata
  app?: {
    name?: string;
    version?: string;
    environment?: string;
  };
  // Request/user context (PII redaction handled server-side)
  ctx?: {
    userId?: string;
    sessionId?: string;
    traceId?: string;
    spanId?: string;
    route?: string;
    locale?: string;
    ip?: string; // server-only trusted
  };
  tags?: Record<string, string | number | boolean | null>;
}

export interface LogEventEnvelope extends BaseEnvelope {
  kind: "log";
  level: Severity;
  message: string;
  data?: Record<string, unknown>;
}

export interface ErrorEventEnvelope extends BaseEnvelope {
  kind: "error";
  message: string;
  name?: string;
  stack?: string;
  data?: Record<string, unknown>;
}

export interface MetricEventEnvelope extends BaseEnvelope {
  kind: "metric";
  name: string;
  value?: number;
  unit?: string;
  data?: Record<string, unknown>;
}

export interface TraceEventEnvelope extends BaseEnvelope {
  kind: "trace";
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number; // epoch ms
  endTime?: number; // epoch ms
  status?: "ok" | "error";
  attributes?: Record<string, string | number | boolean | null>;
}

export interface RumEventEnvelope extends BaseEnvelope {
  kind: "rum";
  webVitals?: {
    cls?: number;
    lcp?: number;
    fid?: number;
    inp?: number;
    ttfb?: number;
    fcp?: number;
  };
  navTiming?: Record<string, number>;
  url?: string;
}

export interface CustomEventEnvelope extends BaseEnvelope {
  kind: "custom";
  event: string;
  data?: Record<string, unknown>;
}

export type TelemetryEnvelope =
  | LogEventEnvelope
  | ErrorEventEnvelope
  | MetricEventEnvelope
  | TraceEventEnvelope
  | RumEventEnvelope
  | CustomEventEnvelope;

export interface TunnelConfig {
  // Route path for intake (e.g. "/api/aperture")
  path: string;
  // JWT secret for HMAC verification (HS256)
  jwtSecret: string;
  // Optional CSRF header key to enforce on browsers
  csrfHeader?: string; // e.g. "x-aperture-csrf"
  // Simple sampling percentages per kind (0..1)
  sampling?: Partial<Record<TelemetryKind, number>>;
  // Provider enablement set at runtime (server-only credentials)
  providers?: Record<string, unknown>;
  // Rate limit per IP per minute
  rateLimitPerMin?: number;
  // Enable verbose logs
  debug?: boolean;
}

export interface DispatchResult {
  accepted: number;
  dropped: number;
  errors: number;
}

