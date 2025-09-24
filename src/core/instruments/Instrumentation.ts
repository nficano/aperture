import { ContextManager } from "../context/ContextManager.js";
import type {
  ApertureContext,
  InstrumentationMetadata,
  InstrumentBaseOptions,
  InstrumentFn,
  InstrumentHandle,
  InstrumentStepOptions,
  Logger,
  LogOptions,
  TagRecord,
} from "../../types/index.js";

const perf = (
  globalThis as {
    performance?: { now: () => number };
  }
).performance;

/**
 * Concrete instrument handle that tracks metadata, timing, and logging side effects.
 * @template T
 */
class InstrumentHandleImpl<T> implements InstrumentHandle<T> {
  private readonly logger: Logger;
  private readonly autoLog: boolean;
  private readonly startTime = getCurrentTime();
  private readonly baseMessage: string;
  private context: ApertureContext;
  private metadata: InstrumentationMetadata;

  /**
   * Creates a new instrument handle bound to the provided logger and base metadata.
   * @param {Logger} logger - Logger used for auto logging.
   * @param {InstrumentationMetadata} metadata - Instrument metadata to seed the handle.
   * @param {ApertureContext} baseContext - Base context applied to downstream logs.
   * @param {boolean} autoLog - Whether lifecycle transitions should emit logs automatically.
   */
  constructor(
    logger: Logger,
    metadata: InstrumentationMetadata,
    baseContext: ApertureContext,
    autoLog: boolean
  ) {
    this.logger = logger;
    this.autoLog = autoLog;
    this.metadata = metadata;
    this.context = {
      ...baseContext,
      instrumentation: metadata,
    };
    this.baseMessage = `${metadata.instrumentType}:${metadata.name}`;

    if (this.autoLog) {
      this.log("info", `${this.baseMessage} started`);
    }
  }

  /**
   * Adds additional tags to the instrument context.
   * @param {TagRecord} tags - Tags to merge into the active instrument scope.
   * @returns {InstrumentHandle<T>} The current handle for chaining.
   */
  annotate(tags: TagRecord): InstrumentHandle<T> {
    const merged = {
      ...this.context.tags,
      ...tags,
    };

    this.context = {
      ...this.context,
      tags: merged,
    };

    return this;
  }

  /**
   * Records a new step within the instrument lifecycle.
   * @param {InstrumentStepOptions} options - Step name and optional metadata overrides.
   * @returns {InstrumentHandle<T>} The current handle for chaining.
   */
  step(options: InstrumentStepOptions): InstrumentHandle<T> {
    this.metadata = {
      ...this.metadata,
      step: options.step,
      status: "start",
      context: {
        ...this.metadata.context,
        ...options.metadata,
      },
    };

    this.context = {
      ...this.context,
      instrumentation: this.metadata,
      tags: {
        ...this.context.tags,
        ...options.tags,
      },
    };

    if (this.autoLog) {
      this.log("info", `${this.baseMessage} step:${options.step}`, {
        tags: options.tags,
      });
    }

    return this;
  }

  /**
   * Marks the instrument as successful and optionally returns the wrapped result.
   * @param {T} [result] - Result produced by the instrumented operation.
   * @param {Record<string, unknown>} [metadata] - Additional metadata to append to the success event.
   * @returns {T | void} Returns the provided result for chaining when supplied.
   */
  success(result?: T, metadata?: Record<string, unknown>): T | void {
    const durationMs = this.getDuration();
    this.metadata = {
      ...this.metadata,
      status: "success",
      durationMs,
      context: {
        ...this.metadata.context,
        ...metadata,
      },
    };

    this.context = {
      ...this.context,
      instrumentation: this.metadata,
    };

    if (this.autoLog) {
      this.log("info", `${this.baseMessage} success`, {
        context: {
          durationMs,
          ...metadata,
        },
      });
    }

    return result;
  }

  /**
   * Marks the instrument as errored and logs the failure.
   * @param {Error} error - Error thrown by the instrumented code path.
   * @param {Record<string, unknown>} [metadata] - Additional metadata to append to the error event.
   * @returns {void}
   */
  error(error: Error, metadata?: Record<string, unknown>): void {
    const durationMs = this.getDuration();
    this.metadata = {
      ...this.metadata,
      status: "error",
      durationMs,
      context: {
        ...this.metadata.context,
        ...metadata,
      },
    };

    this.context = {
      ...this.context,
      instrumentation: this.metadata,
    };

    this.log("error", `${this.baseMessage} error`, {
      error,
      context: {
        durationMs,
        ...metadata,
      },
    });
  }

  /**
   * Marks the instrument as finished with a specific status without wrapping a promise.
   * @param {InstrumentationMetadata['status']} status - Final status for the instrument.
   * @param {Record<string, unknown>} [metadata] - Additional metadata to append.
   * @returns {void}
   */
  finish(
    status: InstrumentationMetadata["status"],
    metadata?: Record<string, unknown>
  ): void {
    const durationMs = this.getDuration();

    this.metadata = {
      ...this.metadata,
      status,
      durationMs,
      context: {
        ...this.metadata.context,
        ...metadata,
      },
    };

    this.context = {
      ...this.context,
      instrumentation: this.metadata,
    };

    if (this.autoLog) {
      this.log("info", `${this.baseMessage} ${status}`, {
        context: {
          durationMs,
          ...metadata,
        },
      });
    }
  }

  /**
   * Executes a function within the instrument context, capturing success or error transitions.
   * @param {InstrumentFn<T>} fn - Function representing the instrumented operation.
   * @returns {Promise<T>} Resolves or rejects with the underlying function result.
   * @throws {unknown} Re-throws any error from the instrumented function.
   */
  async run(fn: InstrumentFn<T>): Promise<T> {
    return await ContextManager.runWithContext(this.context, async () => {
      try {
        const result = await Promise.resolve(fn());
        const maybeResult = this.success(result);
        return (maybeResult ?? result) as T;
      } catch (error) {
        this.error(error as Error);
        throw error;
      }
    });
  }

  /**
   * Computes the elapsed duration since the handle was created.
   * @returns {number} Duration in milliseconds.
   */
  private getDuration(): number {
    return Math.round(getCurrentTime() - this.startTime);
  }

  /**
   * Emits a log event with the instrument context applied.
   * @private
   * @param {"debug" | "info" | "warn" | "error"} level - Log level to emit.
   * @param {string} message - Message describing the lifecycle update.
   * @param {LogOptions} [options] - Additional log options forwarded to the logger.
   * @returns {void}
   */
  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    options?: LogOptions
  ): void {
    const loggerWithContext = this.logger.child({
      ...this.context,
      instrumentation: this.metadata,
    });

    loggerWithContext[level](message, {
      ...options,
      impact: this.context.impact,
    });
  }
}

/**
 * Gets a high-resolution timestamp when available.
 * @returns {number} Current time in milliseconds.
 */
function getCurrentTime(): number {
  return perf === undefined ? Date.now() : perf.now();
}

interface CreateInstrumentOptions extends InstrumentBaseOptions {
  instrumentType: InstrumentationMetadata["instrumentType"];
  name: string;
  identifier?: string;
}

/**
 * Factory helper that constructs an instrument handle for a specific instrument type.
 * @template T
 * @param {Logger} logger - Logger instance used for instrumentation logs.
 * @param {CreateInstrumentOptions} options - Instrument configuration including type and metadata.
 * @returns {InstrumentHandle<T>} A ready-to-use instrument handle.
 */
function createInstrument<T>(
  logger: Logger,
  options: CreateInstrumentOptions
): InstrumentHandle<T> {
  const metadata: InstrumentationMetadata = {
    instrumentType: options.instrumentType,
    name: options.name,
    identifier: options.identifier,
    status: "start",
    context: options.metadata,
  };

  const baseContext: ApertureContext = {
    domain: options.domain,
    impact: options.impact,
    tags: options.tags,
    instrumentation: metadata,
  };

  return new InstrumentHandleImpl<T>(
    logger,
    metadata,
    baseContext,
    options.autoLog !== false
  );
}

/**
 * Creates an instrument handle for user journeys.
 * @template T
 * @param {Logger} logger - Logger used to emit lifecycle events.
 * @param {string} name - Human readable journey name.
 * @param {InstrumentBaseOptions} [options={}] - Optional defaults such as domain, tags, and autoLog.
 * @returns {InstrumentHandle<T>} Instrument handle representing the user journey.
 * @example
 * const journey = instrumentUserJourney(logger, "checkout");
 * await journey.run(processCheckout);
 */
export function instrumentUserJourney<T>(
  logger: Logger,
  name: string,
  options: InstrumentBaseOptions = {}
): InstrumentHandle<T> {
  return createInstrument<T>(logger, {
    instrumentType: "user-journey",
    name,
    ...options,
  });
}

/**
 * Creates an instrument handle for API call tracking.
 * @template T
 * @param {Logger} logger - Logger used to emit lifecycle events.
 * @param {string} endpoint - Identifier for the API endpoint.
 * @param {InstrumentBaseOptions} [options={}] - Optional defaults such as domain, tags, and autoLog.
 * @returns {InstrumentHandle<T>} Instrument handle representing the API call.
 */
export function instrumentApiCall<T>(
  logger: Logger,
  endpoint: string,
  options: InstrumentBaseOptions = {}
): InstrumentHandle<T> {
  return createInstrument<T>(logger, {
    instrumentType: "api-call",
    name: endpoint,
    ...options,
  });
}

/**
 * Creates an instrument handle for funnel tracking.
 * @template T
 * @param {Logger} logger - Logger used to emit lifecycle events.
 * @param {string} name - Funnel name.
 * @param {InstrumentBaseOptions} [options={}] - Optional defaults such as domain, tags, and autoLog.
 * @returns {InstrumentHandle<T>} Instrument handle representing the funnel.
 */
export function instrumentFunnel<T>(
  logger: Logger,
  name: string,
  options: InstrumentBaseOptions = {}
): InstrumentHandle<T> {
  return createInstrument<T>(logger, {
    instrumentType: "funnel",
    name,
    ...options,
  });
}

/**
 * Creates an instrument handle for conversion tracking.
 * @template T
 * @param {Logger} logger - Logger used to emit lifecycle events.
 * @param {string} name - Conversion name.
 * @param {InstrumentBaseOptions} [options={}] - Optional defaults such as domain, tags, and autoLog.
 * @returns {InstrumentHandle<T>} Instrument handle representing the conversion.
 */
export function instrumentConversion<T>(
  logger: Logger,
  name: string,
  options: InstrumentBaseOptions = {}
): InstrumentHandle<T> {
  return createInstrument<T>(logger, {
    instrumentType: "conversion",
    name,
    ...options,
  });
}

/**
 * Runs a function with an instrument handle of the specified type.
 * @template T
 * @param {Logger} logger - Logger used to emit lifecycle events.
 * @param {string} name - Instrument name.
 * @param {InstrumentationMetadata['instrumentType']} instrumentType - Instrument type identifier.
 * @param {InstrumentFn<T>} fn - Function to execute within the instrument context.
 * @param {InstrumentBaseOptions} [options={}] - Optional defaults such as domain, tags, and autoLog.
 * @returns {Promise<T>} Resolves with the function result once the instrument finishes.
 */
export function withInstrument<T>(
  logger: Logger,
  name: string,
  instrumentType: InstrumentationMetadata["instrumentType"],
  fn: InstrumentFn<T>,
  options: InstrumentBaseOptions = {}
): Promise<T> {
  const instrument = createInstrument<T>(logger, {
    instrumentType,
    name,
    ...options,
  });

  return instrument.run(fn);
}

/**
 * Executes a function with the provided domain applied via the ContextManager.
 * @template T
 * @param {string} domain - Domain identifier to apply during execution.
 * @param {() => T} fn - Function to run within the domain context.
 * @returns {T} The callback result.
 */
export function withDomain<T>(domain: string, fn: () => T): T {
  return ContextManager.withDomain(domain, fn);
}
