import { validateEnvelope } from "../../../tunnel/schema.js";
import { TunnelDispatcher } from "../../../tunnel/dispatcher.js";
import { verifyJwtHS256, parseAuthHeader } from "../../../tunnel/security.js";
import { TokenBucketLimiter } from "../../../tunnel/rate-limit.js";
import type { TunnelConfig, TelemetryEnvelope } from "../../../tunnel/types.js";
import { getApertureInstance } from "./server-utils.js";
import zlib from "node:zlib";

// Simple limiter singleton
const limiter = new TokenBucketLimiter(60, 60); // burst 60, 60/min

async function readBody(event: any): Promise<Buffer> {
  const req: any = event.node?.req ?? event.req;
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getIp(event: any): string {
  const req: any = event.node?.req ?? event.req;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function parseJsonMaybeCompressed(buf: Buffer, encoding?: string): any {
  const isGzip = (encoding ?? "").toLowerCase().includes("gzip");
  const raw = isGzip ? zlib.gunzipSync(buf) : buf;
  return JSON.parse(raw.toString("utf8"));
}

async function getRuntimeTunnelConfig(): Promise<
  Partial<TunnelConfig> & { environment?: string }
> {
  try {
    const mod = await import("#imports");
    const rc: any = mod.useRuntimeConfig?.();
    const aperture = rc?.aperture ?? {};
    const t = aperture.tunnel ?? {};
    return {
      path: t.path ?? "/api/aperture",
      jwtSecret: t.jwtSecret,
      csrfHeader: t.csrfHeader ?? "x-aperture-csrf",
      sampling: t.sampling,
      providers: aperture.providers,
      rateLimitPerMin: t.rateLimitPerMin ?? 120,
      debug: t.debug ?? false,
      environment: aperture.environment,
    };
  } catch {
    return { path: "/api/aperture" };
  }
}

export default eventHandler(async (event) => {
  const method = (event.node?.req?.method ??
    event.req?.method ??
    "GET") as string;
  if (method !== "POST") {
    const res: any = event.node?.res ?? event.res;
    res.statusCode = 405;
    res.setHeader?.("allow", "POST");
    res.end?.("Method Not Allowed");
    return;
  }

  const cfg = await getRuntimeTunnelConfig();

  // Rate limit per IP
  const ip = getIp(event);
  const limit = cfg.rateLimitPerMin ?? 120;
  if (!limiter.take(ip, 1)) {
    const res: any = event.node?.res ?? event.res;
    res.statusCode = 429;
    res.end?.("Too Many Requests");
    return;
  }

  // Auth
  const req: any = event.node?.req ?? event.req;
  let auth = parseAuthHeader(req.headers?.authorization);
  if (!auth) {
    // allow token query param for Beacon fallbacks
    try {
      const url = new URL(req.url, "http://localhost");
      const qp = url.searchParams.get("token");
      if (qp) auth = qp;
    } catch {}
  }
  const allowUnsigned =
    (cfg.environment ?? "development") !== "production" && !cfg.jwtSecret;
  if (!allowUnsigned) {
    const ok =
      auth && cfg.jwtSecret ? await verifyJwtHS256(auth, cfg.jwtSecret) : false;
    if (!ok) {
      const res: any = event.node?.res ?? event.res;
      res.statusCode = 401;
      res.end?.("Unauthorized");
      return;
    }
  }

  try {
    const bodyBuf = await readBody(event);
    const payload = parseJsonMaybeCompressed(
      bodyBuf,
      req.headers?.["content-encoding"]
    );
    const items: TelemetryEnvelope[] = Array.isArray(payload)
      ? payload
      : [payload];

    console.log("[tunnel-handler] Incoming batch", {
      ip,
      totalItems: items.length,
      headers: req.headers,
    });

    const aperture = getApertureInstance();
    if (!aperture) throw new Error("aperture-not-initialized");
    const dispatcher = new TunnelDispatcher(aperture);

    let accepted = 0,
      dropped = 0,
      errors = 0;
    for (const raw of items) {
      try {
        console.log("[tunnel-handler] Raw envelope", raw);
        const env = validateEnvelope(raw);
        console.log("[tunnel-handler] Validated envelope", {
          kind: env.kind,
          level: (env as any).level,
          name: (env as any).name,
          tags: env.tags,
        });
        const sampling = cfg.sampling?.[env.kind];
        if (
          typeof sampling === "number" &&
          sampling >= 0 &&
          sampling < 1 &&
          Math.random() > sampling
        ) {
          console.log("[tunnel-handler] Envelope dropped by sampling", {
            kind: env.kind,
            sampling,
          });
          dropped += 1;
          continue;
        }
        const result = await dispatcher.dispatch(env);
        console.log("[tunnel-handler] Dispatch result", {
          kind: env.kind,
          result,
        });
        accepted += result.accepted;
        dropped += result.dropped;
        errors += result.errors;
      } catch {
        console.error("[tunnel-handler] Failed to process envelope", raw);
        errors += 1;
      }
    }

    const res: any = event.node?.res ?? event.res;
    const out = JSON.stringify({ ok: true, accepted, dropped, errors });
    console.log("[tunnel-handler] Response summary", {
      accepted,
      dropped,
      errors,
    });
    res.statusCode = 200;
    res.setHeader?.("content-type", "application/json");
    res.end?.(out);
  } catch (error: any) {
    console.error("[tunnel-handler] Request handling failed", {
      message: error?.message,
      stack: error?.stack,
    });
    const res: any = event.node?.res ?? event.res;
    res.statusCode = 400;
    res.end?.(String(error?.message ?? "bad request"));
  }
});
