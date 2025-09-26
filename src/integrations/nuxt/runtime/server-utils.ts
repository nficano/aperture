import { Aperture } from "../../../core/Aperture.js";
import type { Logger } from "../../../core/logger/Logger.js";

const GLOBAL_KEY = Symbol.for("aperture.instance");

/**
 * Gets the global Aperture instance for server-side usage.
 * This is useful in server API routes where the Nuxt app context is not directly available.
 * @returns {Aperture | undefined} The global Aperture instance if available.
 */
export function getApertureInstance(): Aperture | undefined {
  const globalObject = globalThis as unknown as Record<PropertyKey, unknown>;
  return globalObject[GLOBAL_KEY] as Aperture | undefined;
}

/**
 * Gets the global Aperture logger for server-side usage.
 * This is useful in server API routes where the Nuxt app context is not directly available.
 * @returns {Logger | undefined} The global Aperture logger if available.
 */
export function getApertureLogger(): Logger | undefined {
  const aperture = getApertureInstance();
  return aperture?.getLogger();
}

/**
 * Gets the global Aperture logger for server-side usage, throwing an error if not available.
 * This is useful in server API routes where the Nuxt app context is not directly available.
 * @returns {Logger} The global Aperture logger.
 * @throws {Error} If the Aperture instance is not available.
 */
export function requireApertureLogger(): Logger {
  const logger = getApertureLogger();
  if (!logger) {
    throw new Error(
      "Aperture logger is not available. Make sure the Aperture Nuxt module is properly configured and the plugin has been initialized."
    );
  }
  return logger;
}
