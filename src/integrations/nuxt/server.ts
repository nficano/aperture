// Server-side utilities for accessing Aperture in API routes
// This file is separate from the module to avoid importing @nuxt/kit in server runtime
export {
  getApertureInstance,
  getApertureLogger,
  requireApertureLogger,
} from "./runtime/server-utils.js";
