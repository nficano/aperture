import type {
  ApertureProvider,
  FirebaseProviderOptions,
  LogEvent,
  MetricEvent,
  TraceEvent,
} from "../types/index.js";
import type { FirebaseAdmin } from "firebase-admin";

export type { FirebaseProviderOptions } from "../types/index.js";

type Logger = {
  warn: (...args: unknown[]) => void;
};

const GLOBAL_LOGGER: Logger =
  (globalThis as unknown as { console?: Logger }).console ?? ({
    warn: () => {},
  } satisfies Logger);

/**
 * Persists log and metric events to Google Firestore using the Firebase Admin SDK.
 */
export class FirebaseProvider implements ApertureProvider {
  name = "firebase";

  private firestore: any;
  private readonly options: FirebaseProviderOptions;
  private initialized = false;

  private readonly logger = GLOBAL_LOGGER;

  /**
   * Creates a Firebase provider with optional collection and app overrides.
   * @param {FirebaseProviderOptions} [options={}] - Firestore collection names and transform hooks.
   */
  constructor(options: FirebaseProviderOptions = {}) {
    this.options = {
      collection: "aperture_logs",
      ...options,
    };
  }

  /**
   * Initializes the Firestore client, optionally bootstrapping the Admin SDK.
   * @returns {Promise<void>} Resolves once initialization has completed.
   */
  async setup(): Promise<void> {
    if (this.initialized) return;

    if (this.options.app) {
      this.firestore = this.resolveFirestore(this.options.app);
      this.initialized = Boolean(this.firestore);
      return;
    }

    try {
      const adminModule =
        (await import("firebase-admin")) as typeof import("firebase-admin");
      const firebaseAdmin =
        (adminModule.default ?? adminModule) as FirebaseAdmin;
      const app = firebaseAdmin.apps?.length
        ? firebaseAdmin.apps[0]
        : firebaseAdmin.initializeApp();
      this.firestore = app?.firestore?.();
      this.initialized = Boolean(this.firestore);
    } catch (error) {
      this.logger.warn(
        "[Aperture][Firebase] firebase-admin is not available. Provider disabled.",
        error,
      );
      this.initialized = false;
    }
  }

  /**
   * Writes a log event document to Firestore.
   * @param {LogEvent} event - Log event to persist.
   * @returns {Promise<void>} Resolves when the write has completed or provider disabled.
   */
  async log(event: LogEvent): Promise<void> {
    if (!this.initialized || !this.firestore) return;
    const collection = this.options.collection ?? "aperture_logs";
    const payload = this.options.transform?.(event) ?? this.serialize(event);
    await this.firestore.collection(collection).add(payload);
  }

  /**
   * Writes a metric event document to Firestore.
   * @param {MetricEvent} event - Metric event to persist.
   * @returns {Promise<void>} Resolves when the write has completed or provider disabled.
   */
  async metric(event: MetricEvent): Promise<void> {
    if (!this.initialized || !this.firestore) return;
    const collection = this.options.collection ?? "aperture_metrics";
    const payload = this.options.transform?.(event) ?? this.serialize(event);
    await this.firestore.collection(collection).add(payload);
  }

  /**
   * Writes a trace event document to Firestore.
   * @param {TraceEvent} event - Trace event to persist.
   * @returns {Promise<void>} Resolves when the write has completed or provider disabled.
   */
  async trace(event: TraceEvent): Promise<void> {
    if (!this.initialized || !this.firestore) return;
    const collection = this.options.collection ?? "aperture_traces";
    const payload = this.options.transform?.(event) ?? this.serialize(event);
    await this.firestore.collection(collection).add(payload);
  }

  /**
   * Flush lifecycle hook; Firestore writes are already committed.
   * @returns {void}
   */
  flush(): void {
    // Firestore writes are immediate; nothing to flush.
  }

  /**
   * Resets internal references so the provider can be re-initialized later.
   * @returns {void}
   */
  shutdown(): void {
    this.firestore = undefined;
    this.initialized = false;
  }

  /**
   * Resolves the Firestore instance from an injected Firebase app if available.
   * @param {any} app - Pre-initialized Firebase app instance.
   * @returns {any} Firestore client or undefined when unavailable.
   */
  private resolveFirestore(app: any): any {
    if (!app) return undefined;

    if (typeof app.firestore === "function") {
      return app.firestore();
    }

    return undefined;
  }

  /**
   * Converts an event into a Firestore-friendly payload.
   * @param {LogEvent | MetricEvent} payload - Event to serialize.
   * @returns {Record<string, unknown>} Serialized payload with ISO timestamp.
   */
  private serialize(
    payload: LogEvent | MetricEvent | TraceEvent,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      ...payload,
    };

    if ("timestamp" in payload) {
      base.timestamp =
        payload.timestamp instanceof Date
          ? payload.timestamp.toISOString()
          : payload.timestamp;
    }

    if ("startTime" in payload) {
      base.startTime = payload.startTime instanceof Date
        ? payload.startTime.toISOString()
        : payload.startTime;
    }

    if ("endTime" in payload && payload.endTime) {
      base.endTime = payload.endTime instanceof Date
        ? payload.endTime.toISOString()
        : payload.endTime;
    }

    return base;
  }
}
