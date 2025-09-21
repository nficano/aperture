import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent, stubConsole } from '../_helpers.js';

const modulePath = '../../src/providers/SentryProvider.js';

describe('SentryProvider', () => {
  it('should initialize Sentry when setup executes', async () => {
    // Arrange
    const init = vi.fn();
    const flush = vi.fn();
    const close = vi.fn();
    const captureException = vi.fn();
    const captureMessage = vi.fn();
    const captureEvent = vi.fn();

    vi.doMock('@sentry/node', () => ({
      init,
      isInitialized: () => false,
      flush,
      close,
      captureException,
      captureMessage,
      captureEvent,
    }), { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider({ dsn: 'dsn', sampleRate: 0.5 });

    try {
      // Act
      await provider.setup({ environment: 'production', release: '1.0.0' });

      // Assert
      expect(init).toHaveBeenCalledWith({
        dsn: 'dsn',
        environment: 'production',
        release: '1.0.0',
        sampleRate: 0.5,
        tracesSampleRate: 0.1,
        attachStacktrace: true,
      });
    } finally {
      vi.unmock('@sentry/node');
    }
  });

  it('should capture exception when log called with error', async () => {
    // Arrange
    const captureException = vi.fn();
    const captureMessage = vi.fn();
    const captureEvent = vi.fn();
    const flush = vi.fn();
    const close = vi.fn();
    const sentryModule = {
      init: vi.fn(),
      isInitialized: () => true,
      captureException,
      captureMessage,
      captureEvent,
      flush,
      close,
    };

    vi.doMock('@sentry/node', () => sentryModule, { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider();

    try {
      await provider.setup({ environment: 'test' });
      const error = new Error('broken');

      // Act
      provider.log(createLogEvent({ error }));

      // Assert
      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          level: 'info',
          tags: expect.objectContaining({
            domain: 'testing',
            impact: 'reliability',
          }),
          contexts: expect.objectContaining({
            runtime: expect.objectContaining({ environment: 'test' }),
            data: expect.objectContaining({ path: '/health' }),
          }),
        }),
      );
    } finally {
      vi.unmock('@sentry/node');
    }
  });

  it('should capture message when log called without error', async () => {
    // Arrange
    const captureException = vi.fn();
    const captureMessage = vi.fn();
    const captureEvent = vi.fn();
    const sentryModule = {
      init: vi.fn(),
      isInitialized: () => true,
      captureException,
      captureMessage,
      captureEvent,
      flush: vi.fn(),
      close: vi.fn(),
    };

    vi.doMock('@sentry/node', () => sentryModule, { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider();

    try {
      await provider.setup({ environment: 'test' });

      // Act
      provider.log(createLogEvent({ error: undefined }));

      // Assert
      expect(captureException).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith('test-message', expect.objectContaining({
        level: 'info',
      }));
    } finally {
      vi.unmock('@sentry/node');
    }
  });

  it('should capture metric when metric invoked', async () => {
    // Arrange
    const captureEvent = vi.fn();
    const sentryModule = {
      init: vi.fn(),
      isInitialized: () => true,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      captureEvent,
      flush: vi.fn(),
      close: vi.fn(),
    };

    vi.doMock('@sentry/node', () => sentryModule, { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider();

    try {
      await provider.setup({ environment: 'test' });

      // Act
      provider.metric(createMetricEvent({ value: 5, unit: 'ms' }));

      // Assert
      expect(captureEvent).toHaveBeenCalledWith(expect.objectContaining({
        message: 'test-metric',
        extra: expect.objectContaining({ value: 5, unit: 'ms' }),
      }));
    } finally {
      vi.unmock('@sentry/node');
    }
  });

  it('should warn when Sentry module is unavailable', async () => {
    // Arrange
    const stub = stubConsole();
    vi.doMock('@sentry/node', () => { throw new Error('missing'); }, { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider();

    try {
      // Act
      await provider.setup({ environment: 'test' });
      provider.log(createLogEvent());

      // Assert
      expect(stub.calls.warn[0]?.[0]).toContain('[Aperture][Sentry]');
    } finally {
      stub.restore();
      vi.unmock('@sentry/node');
    }
  });

  it('should forward flush and shutdown calls when available', async () => {
    // Arrange
    const flush = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const sentryModule = {
      init: vi.fn(),
      isInitialized: () => true,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      captureEvent: vi.fn(),
      flush,
      close,
    };

    vi.doMock('@sentry/node', () => sentryModule, { virtual: true });
    vi.resetModules();
    const { SentryProvider } = await import(modulePath);
    const provider = new SentryProvider();

    try {
      await provider.setup({ environment: 'test' });

      // Act
      await provider.flush();
      await provider.shutdown();

      // Assert
      expect(flush).toHaveBeenCalledWith(2000);
      expect(close).toHaveBeenCalledWith(2000);
    } finally {
      vi.unmock('@sentry/node');
    }
  });
});
