import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent } from '../_helpers.js';

const modulePath = '../../src/providers/NewRelicProvider.js';

describe('NewRelicProvider', () => {
  it('should transform log events to New Relic payload when logging event', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { NewRelicProvider } = await import(modulePath);
    const provider = new NewRelicProvider({
      licenseKey: 'key',
      service: 'checkout',
      environment: 'staging',
    });
    const error = new Error('boom');

    // Act
    provider.log(
      createLogEvent({
        error,
        context: { stage: 'beta' },
        tags: { attempt: '1' },
      }),
    );
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.service).toBe('checkout');
    expect(payload.environment).toBe('staging');
    expect(payload.level).toBe('info');
    expect(payload.message).toBe('test-message');
    expect(payload.context).toEqual({ stage: 'beta' });
    expect(payload.error).toEqual({
      message: 'boom',
      stack: error.stack,
    });
  });

  it('should transform metric events when sending metrics', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { NewRelicProvider } = await import(modulePath);
    const provider = new NewRelicProvider({
      licenseKey: 'key',
      service: 'checkout',
      environment: 'staging',
    });

    // Act
    provider.metric(createMetricEvent({ value: 12, unit: 'ms' }));
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.type).toBe('metric');
    expect(payload.name).toBe('test-metric');
    expect(payload.value).toBe(12);
    expect(payload.unit).toBe('ms');
  });

  it('should omit error field when no error present and keep non-Date timestamp', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { NewRelicProvider } = await import(modulePath);
    const provider = new NewRelicProvider({
      licenseKey: 'key',
      service: 'checkout',
      environment: 'staging',
    });

    const ts = 1700000000000;

    // Act
    provider.log(createLogEvent({ error: undefined, timestamp: ts as unknown as Date }));
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.timestamp).toBe(ts);
    expect('error' in payload).toBe(false);
  });
});
