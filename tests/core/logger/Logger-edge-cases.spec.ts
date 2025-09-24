import { describe, it, expect, vi } from 'vitest';

const modulePath = '../../../src/core/logger/Logger.js';

describe('ApertureLogger edge cases', () => {
  it('falls back to development environment when NODE_ENV unavailable', async () => {
    // Arrange
    const originalEnv = process.env;
    // Use an empty env object to simulate missing NODE_ENV safely
    // @ts-expect-error assigning for test
    process.env = {};
    vi.resetModules();
    const { ApertureLogger } = await import(modulePath);

    const events: any[] = [];
    const provider = { name: 'memory', log: (e: any) => events.push(e) } as any;

    try {
      // Act
      const logger = new ApertureLogger({ providers: [provider] });
      logger.info('hello');

      // Assert
      expect(events[0]?.runtime?.environment).toBe('development');
    } finally {
      process.env = originalEnv;
    }
  });

  it('uses empty providers array when providers are not supplied', async () => {
    // Arrange
    const { ApertureLogger } = await import(modulePath);
    const logger = new ApertureLogger({ environment: 'test' });

    // Act & Assert: should not throw when logging without providers
    logger.debug('no providers');
    expect(true).toBe(true);
  });
});
