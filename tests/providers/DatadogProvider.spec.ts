import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent } from '../_helpers.js';

const modulePath = '../../src/providers/DatadogProvider.js';

describe('DatadogProvider', () => {
  it('should serialize log events when logging event', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { DatadogProvider } = await import(modulePath);
    const provider = new DatadogProvider({
      apiKey: 'apikey',
      service: 'payments',
      environment: 'production',
      tags: { region: 'us' },
    });
    const error = new Error('down');

    // Act
    provider.log(
      createLogEvent({
        tags: { attempt: '1' },
        context: { stage: 'beta' },
        error,
      }),
    );
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.ddsource).toBe('aperture');
    expect(payload.service).toBe('payments');
    expect(payload.environment).toBe('production');
    expect(payload.level).toBe('info');
    expect(payload.message).toBe('test-message');
    expect(payload.ddtags).toContain('region:us');
    expect(payload.ddtags).toContain('attempt:1');
    expect(payload.attributes.runtime.environment).toBe('test');
    expect(payload.attributes.error).toEqual({
      message: 'down',
      stack: error.stack,
    });
  });

  it('should serialize metric events when sending metrics', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { DatadogProvider } = await import(modulePath);
    const provider = new DatadogProvider({
      apiKey: 'apikey',
      service: 'payments',
      environment: 'production',
      ddsource: 'custom',
    });

    // Act
    provider.metric(createMetricEvent({ value: 42, unit: 'ms' }));
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.message).toBe('test-metric');
    expect(payload.attributes.value).toBe(42);
    expect(payload.attributes.unit).toBe('ms');
    expect(payload.ddsource).toBe('custom');
  });

  it('should keep non-Date timestamps as-is', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { DatadogProvider } = await import(modulePath);
    const provider = new DatadogProvider({
      apiKey: 'apikey',
      service: 'payments',
      environment: 'production',
    });

    const ts = 1700000000000;

    // Act
    provider.log(createLogEvent({ timestamp: ts as unknown as Date }));
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.timestamp).toBe(ts);
  });
});
