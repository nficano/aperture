import { describe, it, expect } from "vitest";

describe("Main module exports", () => {
  it("should export all public APIs", async () => {
    // Import the main module to ensure coverage
    const aperture = await import("../src/index.js");

    // Verify key exports exist
    expect(aperture.Aperture).toBeDefined();
    expect(aperture.ContextManager).toBeDefined();
    expect(aperture.DomainRegistry).toBeDefined();
    expect(aperture.ApertureLogger).toBeDefined();
    expect(aperture.ConsoleProvider).toBeDefined();
    expect(aperture.FirebaseProvider).toBeDefined();
    expect(aperture.SentryProvider).toBeDefined();
    expect(aperture.HttpProvider).toBeDefined();
    expect(aperture.DatadogProvider).toBeDefined();
    expect(aperture.NewRelicProvider).toBeDefined();
  });
});
