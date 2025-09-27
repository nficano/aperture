export * from "./types/index.js";
export * from "./core/Aperture.js";
export * from "./core/context/ContextManager.js";
export * from "./core/domains/DomainRegistry.js";
export * from "./core/logger/Logger.js";
export * from "./core/instruments/Instrumentation.js";
export * from "./providers/ConsoleProvider.js";
export * from "./providers/FirebaseProvider.js";
export * from "./providers/SentryProvider.js";
export * from "./providers/HttpProvider.js";
export * from "./providers/DatadogProvider.js";
export * from "./providers/NewRelicProvider.js";

// Server-side utilities for Nuxt (separate from module to avoid @nuxt/kit imports in server runtime)
export * from "./integrations/nuxt/server.js";

// Tunnel core types (optional external use)
export * from "./tunnel/types.js";
