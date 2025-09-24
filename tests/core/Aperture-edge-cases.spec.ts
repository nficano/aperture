import { describe, it, expect, vi } from "vitest";

const modulePath = "../../src/core/Aperture.js";

describe("Aperture edge cases", () => {
  it("should handle missing console gracefully", async () => {
    // Arrange
    const originalConsole = globalThis.console;
    // @ts-expect-error - intentionally removing console
    delete globalThis.console;

    vi.resetModules();
    const { Aperture } = await import(modulePath);

    try {
      // Act
      const aperture = new Aperture();
      const provider = {
        name: "test",
        setup: () => {
          throw new Error("setup failed");
        },
      };

      // This should not throw even without console
      aperture.registerProvider(provider);

      // Assert
      expect(aperture.listProviders()).toContain("test");
    } finally {
      // Restore console
      globalThis.console = originalConsole;
    }
  });
});
