import type {
  ApertureProvider,
  ConsolaProviderOptions,
  LogEvent,
  MetricEvent,
  ProviderContext,
  TraceEvent,
} from "../types/index.js";
import { renderValue } from "./utils/renderValue.js";

type ConsolaLike = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  withTag?: (tag: string) => ConsolaLike;
};

type ConsolaModule = {
  create?: (options?: Record<string, unknown>) => ConsolaLike;
  default?: ConsolaModule | ConsolaLike;
};

type RequireFunction = (id: string) => unknown;

type ConsoleLike = {
  log?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

const isNodeEnvironment = (): boolean => {
  const processCandidate = (
    globalThis as {
      process?: { versions?: { node?: string } };
    }
  ).process;
  return Boolean(processCandidate?.versions?.node);
};

// Lazily detect Node's `require` to avoid bundlers from loading the `module` builtin in browser builds.
const resolveRequire = (): RequireFunction | null => {
  if (!isNodeEnvironment()) return null;

  try {
    const directRequire = new Function(
      "return typeof require === 'function' ? require : null;"
    )();
    if (typeof directRequire === "function") {
      return directRequire as RequireFunction;
    }
  } catch {
    // Ignore attempts when `require` is not defined.
  }

  try {
    const moduleExports = new Function("return require('module');")() as {
      createRequire?: (url: string) => RequireFunction;
    };
    if (typeof moduleExports?.createRequire === "function") {
      return moduleExports.createRequire(import.meta.url) as RequireFunction;
    }
  } catch {
    // Ignore when the Node `module` builtin is unavailable.
  }

  return null;
};

const REQUIRE = resolveRequire();

const noop = (): void => {};

const createConsoleFallback = (): ConsolaLike => {
  const target = (globalThis as { console?: ConsoleLike }).console ?? {};
  const bind = (method: keyof ConsoleLike) => {
    const fn = target[method] ?? target.log;
    return typeof fn === "function" ? fn.bind(target) : noop;
  };

  const fallback: ConsolaLike = {
    log: bind("log"),
    info: bind("info"),
    warn: bind("warn"),
    error: bind("error"),
    debug: bind("debug"),
  };

  fallback.withTag = () => fallback;

  return fallback;
};

const isConsolaLike = (value: unknown): value is ConsolaLike => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ConsolaLike;
  return ["log", "info", "warn", "error", "debug"].every((method) =>
    typeof candidate[method as keyof ConsoleLike] === "function"
  );
};

let warnedAboutMissingConsola = false;

const loadConsolaModule = (): ConsolaModule | ConsolaLike => {
  const globalCandidate = (
    globalThis as { consola?: ConsolaModule | ConsolaLike }
  ).consola;
  if (globalCandidate) return globalCandidate;

  if (!REQUIRE) {
    if (!warnedAboutMissingConsola) {
      warnedAboutMissingConsola = true;
      const consoleLike = (globalThis as { console?: ConsoleLike }).console;
      consoleLike?.warn?.(
        "[Aperture][ConsolaProvider] consola not available; using console fallback."
      );
    }

    return createConsoleFallback();
  }

  try {
    return REQUIRE("consola") as ConsolaModule | ConsolaLike;
  } catch (error) {
    const message =
      "[Aperture][ConsolaProvider] The 'consola' package is required. Install it with `npm install consola`.";
    const missing = new Error(message);
    (missing as any).cause = error;
    throw missing;
  }
};

const createConsolaInstance = (
  options: ConsolaProviderOptions
): ConsolaLike => {
  const module = loadConsolaModule();
  const config: Record<string, unknown> = {};

  if (isConsolaLike(module)) {
    return module;
  }

  if (options.createOptions) {
    Object.assign(config, options.createOptions);
  }

  if (typeof options.tag === "string") {
    config.tag = options.tag;
  }
  if (typeof options.level === "number") {
    config.level = options.level;
  }
  if (typeof options.fancy === "boolean") {
    config.fancy = options.fancy;
  }
  if (options.reporters) {
    config.reporters = options.reporters;
  }
  if (options.defaults) {
    config.defaults = options.defaults;
  }

  const candidates = [module, (module as ConsolaModule)?.default];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isConsolaLike(candidate)) {
      return candidate;
    }
    if (typeof (candidate as ConsolaModule).create === "function") {
      const created = (candidate as ConsolaModule).create?.(config);
      if (created) return created;
      continue;
    }
    if (typeof candidate === "function") {
      return (candidate as (...args: unknown[]) => ConsolaLike)(config);
    }
  }

  throw new Error(
    "[Aperture][ConsolaProvider] Unable to create a consola instance. Ensure you are using consola@3 or provide a custom logger."
  );
};

export type { ConsolaProviderOptions } from "../types/index.js";

/**
 * Provider that emits Aperture events through a consola logger instance.
 */
export class ConsolaProvider implements ApertureProvider {
  name = "consola";
  private environment: ProviderContext["environment"] = "development";
  private readonly options: ConsolaProviderOptions;
  private readonly logger: ConsolaLike;

  constructor(options: ConsolaProviderOptions = {}) {
    this.options = options;
    const baseLogger = createConsolaInstance(options);
    this.logger =
      options.tag && typeof baseLogger.withTag === "function"
        ? baseLogger.withTag(options.tag)
        : baseLogger;
  }

  setup(context: ProviderContext): void {
    this.environment = context.environment;
  }

  log(event: LogEvent): void {
    if (this.options.debug) {
      this.logger.debug(`[consola] Debug - Log event received:`, {
        message: event.message,
        level: event.level,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        timestamp: event.timestamp,
      });
    }

    if (this.environment === "production") {
      const payload = this.redact(event);
      this.logger.info(JSON.stringify(payload, null, 2));
      return;
    }

    const parts: string[] = [];
    parts.push(`[${event.level.toUpperCase()}]`, event.message);

    if (event.domain) {
      parts.push(`domain=${event.domain}`);
    }

    if (event.impact) {
      parts.push(`impact=${event.impact}`);
    }

    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(`tags=${renderValue(event.tags, this.shouldPrettyPrint())}`);
    }

    if (event.instrumentation) {
      parts.push(
        `instrument=${renderValue(
          event.instrumentation,
          this.shouldPrettyPrint()
        )}`
      );
    }

    if (event.error) {
      parts.push(`error=${event.error.stack ?? event.error.message}`);
    }

    if (event.context && Object.keys(event.context).length > 0) {
      parts.push(`ctx=${renderValue(event.context, this.shouldPrettyPrint())}`);
    }

    this.logWithLevel(event.level, parts.join(" | "));
  }

  metric(event: MetricEvent): void {
    if (this.options.debug) {
      this.logger.debug(`[consola] Debug - Metric event received:`, {
        name: event.name,
        value: event.value,
        unit: event.unit,
        domain: event.domain,
        impact: event.impact,
        tags: event.tags,
        timestamp: event.timestamp,
      });
    }

    if (this.environment === "production") {
      this.logger.info(
        JSON.stringify({ type: "metric", ...this.redact(event) }, null, 2)
      );
      return;
    }

    const parts: string[] = [];
    parts.push(`[METRIC]`, `${event.name}=${event.value ?? "n/a"}`);

    if (event.domain) parts.push(`domain=${event.domain}`);
    if (event.impact) parts.push(`impact=${event.impact}`);
    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(`tags=${renderValue(event.tags, this.shouldPrettyPrint())}`);
    }

    this.logger.log(parts.join(" | "));
  }

  trace(event: TraceEvent): void {
    if (this.options.debug) {
      this.logger.debug(`[consola] Debug - Trace event received:`, {
        name: event.name,
        traceId: event.traceId,
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        status: event.status,
        attributes: event.attributes,
      });
    }

    if (this.environment === "production") {
      const payload = {
        ...event,
        startTime:
          event.startTime instanceof Date
            ? event.startTime.toISOString()
            : event.startTime,
        endTime:
          event.endTime instanceof Date
            ? event.endTime.toISOString()
            : event.endTime,
        type: "trace",
      };
      this.logger.info(JSON.stringify(this.redact(payload), null, 2));
      return;
    }

    const parts: string[] = [];
    parts.push(`[TRACE]`, event.name, `traceId=${event.traceId}`);

    if (event.spanId) parts.push(`spanId=${event.spanId}`);
    if (event.parentSpanId) parts.push(`parent=${event.parentSpanId}`);
    if (event.status) parts.push(`status=${event.status}`);
    if (event.tags && Object.keys(event.tags).length > 0) {
      parts.push(`tags=${renderValue(event.tags, this.shouldPrettyPrint())}`);
    }
    if (event.attributes && Object.keys(event.attributes).length > 0) {
      parts.push(
        `attrs=${renderValue(event.attributes, this.shouldPrettyPrint())}`
      );
    }

    this.logger.log(parts.join(" | "));
  }

  flush(): void {
    // No-op for consola provider.
  }

  shutdown(): void {
    // No-op for consola provider.
  }

  private shouldPrettyPrint(): boolean {
    return this.options.prettyJson !== false;
  }

  private logWithLevel(level: LogEvent["level"], ...args: unknown[]): void {
    const method = this.logger[level] ?? this.logger.log;
    if (typeof method === "function") {
      method.apply(this.logger, args);
      return;
    }
    this.logger.log(...args);
  }

  private redact<T>(payload: T): T {
    const redactKeys = this.options.redactKeys ?? [];
    if (redactKeys.length === 0) return payload;
    if (payload === null || typeof payload !== "object") {
      return payload;
    }

    const clone: Record<string, unknown> = {
      ...(payload as Record<string, unknown>),
    };
    for (const key of redactKeys) {
      if (key in clone) {
        clone[key] = "[REDACTED]";
      }
    }

    return clone as T;
  }
}
