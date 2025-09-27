import type { ApertureNuxtOptions } from '../../../src/types/index'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    aperture?: ApertureNuxtOptions
  }
  interface RuntimeConfig {
    aperture?: ApertureNuxtOptions
  }
}

