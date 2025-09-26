export type LogLevel = "debug" | "info" | "warn" | "error";

export type ImpactType =
  | "revenue"
  | "engagement"
  | "performance"
  | "reliability"
  | "none";

export type Domain = string;

export interface TagRecord {
  [key: string]: string | number | boolean | null | undefined;
}

export interface InstrumentationMetadata {
  instrumentType:
    | "user-journey"
    | "api-call"
    | "funnel"
    | "conversion"
    | "custom";
  name: string;
  identifier?: string;
  step?: string;
  status?: "start" | "success" | "error" | "abort";
  durationMs?: number;
  context?: Record<string, unknown>;
}

export interface ApertureContext {
  domain?: Domain;
  impact?: ImpactType;
  tags?: TagRecord;
  instrumentation?: InstrumentationMetadata;
  user?: {
    id?: string;
    sessionId?: string;
    traits?: Record<string, unknown>;
  };
}

export interface LogEvent {
  level: LogLevel;
  message: string;
  timestamp: Date;
  domain?: Domain;
  impact?: ImpactType;
  tags?: TagRecord;
  context?: Record<string, unknown>;
  error?: Error;
  instrumentation?: InstrumentationMetadata;
  runtime?: {
    requestId?: string;
    locale?: string;
    route?: string;
    environment: "development" | "production" | "test";
  };
}

export interface MetricEvent {
  name: string;
  value?: number;
  unit?: string;
  timestamp: Date;
  domain?: Domain;
  impact?: ImpactType;
  tags?: TagRecord;
  instrumentation?: InstrumentationMetadata;
  context?: Record<string, unknown>;
}

export interface DomainDefinition {
  name: Domain;
  description?: string;
  defaultImpact?: ImpactType;
  defaultTags?: TagRecord;
}

export interface ProviderContext {
  environment: "development" | "production" | "test";
  release?: string;
  runtime?: Record<string, unknown>;
}

export interface ApertureProvider {
  name: string;
  setup?(context: ProviderContext): Promise<void> | void;
  log?(event: LogEvent): Promise<void> | void;
  metric?(event: MetricEvent): Promise<void> | void;
  flush?(): Promise<void> | void;
  shutdown?(): Promise<void> | void;
}

export interface ProviderFactoryOptions {
  environment: "development" | "production" | "test";
  config?: Record<string, unknown>;
}

export type ProviderFactory = (
  options: ProviderFactoryOptions
) => ApertureProvider;

export interface LoggerConfig {
  environment?: "development" | "production" | "test";
  providers?: ApertureProvider[];
  defaultTags?: TagRecord;
}

export interface LogOptions {
  tags?: TagRecord;
  context?: Record<string, unknown>;
  error?: Error;
  impact?: ImpactType;
  domain?: Domain;
}

export interface Logger {
  debug(message: string, options?: LogOptions): void;
  info(message: string, options?: LogOptions): void;
  warn(message: string, options?: LogOptions): void;
  error(message: string, options?: LogOptions): void;
  withDomain(domain: Domain): Logger;
  withTags(tags: TagRecord): Logger;
  withImpact(impact: ImpactType): Logger;
  child(context: Partial<ApertureContext>): Logger;
}

export type InstrumentFn<T> = () => Promise<T> | T;

export interface InstrumentBaseOptions {
  domain?: Domain;
  impact?: ImpactType;
  tags?: TagRecord;
  autoLog?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InstrumentStepOptions {
  step: string;
  tags?: TagRecord;
  metadata?: Record<string, unknown>;
}

export interface InstrumentHandle<T = unknown> {
  annotate(tags: TagRecord): InstrumentHandle<T>;
  step(options: InstrumentStepOptions): InstrumentHandle<T>;
  success(
    result?: T,
    metadata?: Record<string, unknown>
  ): Promise<T | void> | T | void;
  error(error: Error, metadata?: Record<string, unknown>): Promise<void> | void;
  finish(
    status: InstrumentationMetadata["status"],
    metadata?: Record<string, unknown>
  ): Promise<void> | void;
  run(fn: InstrumentFn<T>): Promise<T>;
}

export interface ApertureOptions {
  environment?: "development" | "production" | "test";
  defaultTags?: TagRecord;
  release?: string;
  runtime?: Record<string, unknown>;
  domains?: DomainDefinition[];
  providers?: ApertureProvider[];
}

export interface ConsoleProviderOptions {
  enableColors?: boolean;
  redactKeys?: string[];
  debug?: boolean;
}

export interface FirebaseProviderOptions {
  collection?: string;
  app?: unknown;
  transform?(payload: LogEvent | MetricEvent): Record<string, unknown>;
  debug?: boolean;
}

export interface SentryProviderOptions {
  dsn?: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  environment?: string;
  release?: string;
  attachStacktrace?: boolean;
  debug?: boolean;
}

export interface DatadogProviderOptions {
  apiKey: string;
  service: string;
  environment?: string;
  ddsource?: string;
  tags?: Record<string, string | number | boolean>;
  endpoint?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  // Browser RUM credentials (for client-side monitoring)
  rumApplicationId?: string;
  rumClientToken?: string;
  site?: string; // e.g., 'datadoghq.com', 'datadoghq.eu', etc.
  debug?: boolean;
}

export interface NewRelicProviderOptions {
  licenseKey: string;
  service: string;
  environment?: string;
  endpoint?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  // Browser agent credentials (for client-side monitoring)
  accountID?: string;
  trustKey?: string;
  agentID?: string;
  applicationID?: string;
  debug?: boolean;
}

export interface HttpProviderOptions {
  name: string;
  endpoint: string;
  headers?: Record<string, string>;
  batchSize?: number;
  flushIntervalMs?: number;
  transform?(payload: LogEvent | MetricEvent): Record<string, unknown>;
  onError?(error: unknown): void;
  debug?: boolean;
}

export interface ApertureNuxtProviderOptions {
  console?: boolean | ConsoleProviderOptions;
  firebase?: false | FirebaseProviderOptions;
  sentry?: false | SentryProviderOptions;
  datadog?: false | DatadogProviderOptions;
  newRelic?: false | NewRelicProviderOptions;
}

export interface ApertureNuxtOptions {
  enabled?: boolean;
  environment?: "development" | "production" | "test";
  defaultTags?: TagRecord;
  release?: string;
  runtime?: Record<string, unknown>;
  domains?: DomainDefinition[];
  providers?: ApertureNuxtProviderOptions;
}
