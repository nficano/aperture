import type { ApertureNuxtOptions } from "./module.js";

declare module "@nuxt/schema" {
  interface NuxtConfig {
    aperture?: ApertureNuxtOptions;
  }
}
