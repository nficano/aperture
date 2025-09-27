import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent, fixedDate } from '../_helpers.js';

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
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://log-api.newrelic.com/log/v1');

    const body = request?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.message).toBe('test-message');
    expect(payload.timestamp).toBe(fixedDate.getTime());
    expect(payload.attributes['service.name']).toBe('checkout');
    expect(payload.attributes.environment).toBe('staging');
    expect(payload.attributes['log.level']).toBe('info');
    expect(payload.attributes.context).toEqual({ stage: 'beta' });
    expect(payload.attributes.attempt).toBe('1');
    expect(payload.attributes['error.message']).toBe('boom');
    expect(payload.attributes['error.stack']).toBe(error.stack);
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
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://metric-api.newrelic.com/metric/v1');

    const body = request?.body as string;
    const payload = JSON.parse(body)[0];
    const metric = payload.metrics[0];
    expect(metric.name).toBe('test-metric');
    expect(metric.type).toBe('gauge');
    expect(metric.value).toBe(12);
    expect(metric.attributes['service.name']).toBe('checkout');
    expect(metric.attributes.environment).toBe('staging');
    expect(metric.attributes.unit).toBe('ms');
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
    expect(payload.attributes['error.message']).toBeUndefined();
  });
});
