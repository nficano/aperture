import type {
  TelemetryEnvelope,
  TelemetryKind,
  Severity,
} from "./types.js";

const allowedKinds = new Set<TelemetryKind>([
  "log",
  "error",
  "metric",
  "trace",
  "rum",
  "custom",
]);

const allowedSev = new Set<Severity>(["debug", "info", "warn", "error"]);

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function validateEnvelope(input: unknown): TelemetryEnvelope {
  if (!isObject(input)) throw new Error("invalid payload: expected object");
  const schema = input.schema;
  if (schema !== "aperture.v1") throw new Error("unsupported schema");
  const kind = input.kind as TelemetryKind;
  if (!allowedKinds.has(kind)) throw new Error("invalid kind");
  const ts = Number((input as any).ts);
  if (!Number.isFinite(ts)) throw new Error("invalid ts");

  switch (kind) {
    case "log": {
      const level = (input as any).level as any;
      if (!allowedSev.has(level)) throw new Error("invalid level");
      if (typeof (input as any).message !== "string")
        throw new Error("invalid message");
      break;
    }
    case "error": {
      if (typeof (input as any).message !== "string")
        throw new Error("invalid message");
      break;
    }
    case "metric": {
      if (typeof (input as any).name !== "string")
        throw new Error("invalid name");
      const v = (input as any).value;
      if (v !== undefined && typeof v !== "number")
        throw new Error("invalid value");
      break;
    }
    case "trace": {
      const b = input as any;
      if (typeof b.name !== "string") throw new Error("invalid name");
      if (typeof b.traceId !== "string") throw new Error("invalid traceId");
      if (typeof b.spanId !== "string") throw new Error("invalid spanId");
      if (!Number.isFinite(Number(b.startTime)))
        throw new Error("invalid startTime");
      if (b.endTime !== undefined && !Number.isFinite(Number(b.endTime)))
        throw new Error("invalid endTime");
      break;
    }
    case "rum":
    case "custom": {
      break;
    }
  }
  return input as TelemetryEnvelope;
}
