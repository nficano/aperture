import { useNuxtApp } from "#app";
import type { Aperture } from "../../../../core/Aperture.js";
import type { Logger } from "../../../../core/logger/Logger.js";

export interface ApertureClientApi {
  capture?(payload: unknown): unknown;
  log?(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
    tags?: Record<string, unknown>
  ): unknown;
  error?(
    error: unknown,
    ctx?: {
      message?: string;
      data?: Record<string, unknown>;
      tags?: Record<string, unknown>;
    }
  ): unknown;
  metric?(
    name: string,
    value?: number,
    unit?: string,
    tags?: Record<string, unknown>
  ): unknown;
  trace?(span: Record<string, unknown>): unknown;
  rum?(data: Record<string, unknown>): unknown;
  flush?(): Promise<void> | void;
}

export interface UseApertureResult {
  aperture: Aperture;
  logger: Logger;
  api: ApertureClientApi;
}

/**
 * Convenience composable that exposes the shared Aperture instance, logger, and client API bindings.
 * @returns {UseApertureResult} Available Aperture runtime utilities for the current app context.
 */
export function useAperture(): UseApertureResult {
  const nuxtApp = useNuxtApp();
  const aperture = nuxtApp.$aperture as Aperture | undefined;

  if (!aperture) {
    throw new Error(
      "Aperture instance is not available. Ensure the Aperture Nuxt module is enabled."
    );
  }

  const logger =
    (nuxtApp.$apertureLogger as Logger | undefined) ?? aperture.getLogger();
  const api = (nuxtApp.$apertureApi as ApertureClientApi | undefined) ?? {};

  return { aperture, logger, api };
}
