import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent } from '../_helpers.js';

const modulePath = '../../src/providers/HttpProvider.js';

describe('HttpProvider', () => {
  it('should send batched payload when batch size is reached', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test/logs',
      batchSize: 2,
    });

    const logEvent = createLogEvent({ timestamp: new Date('2024-01-01T00:00:00.000Z') });
    const metricEvent = createMetricEvent({ timestamp: new Date('2024-01-01T00:01:00.000Z') });

    // Act
    provider.log(logEvent);
    provider.metric(metricEvent);
    await provider.flush();

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([
        { ...logEvent, timestamp: '2024-01-01T00:00:00.000Z' },
        { ...metricEvent, timestamp: '2024-01-01T00:01:00.000Z' },
      ]),
    });
  });

  it('should flush automatically on next microtask when no interval is configured', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test/logs',
      batchSize: 5,
    });

    const logEvent = createLogEvent();

    // Act
    provider.log(logEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/logs',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((options as { body: string }).body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ message: logEvent.message });
  });

  it('should use transform when provided and send transformed payload', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test',
      transform: () => ({ ok: true }),
    });

    // Act
    provider.log(createLogEvent());
    await provider.flush();

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://example.test', expect.objectContaining({
      body: JSON.stringify([{ ok: true }]),
    }));
  });

  it('should invoke onError when fetch is unavailable', async () => {
    // Arrange
    const onError = vi.fn();
    vi.stubGlobal('fetch', undefined as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test',
      onError,
    });

    // Act
    provider.log(createLogEvent());
    await provider.flush();

    // Assert
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should clear interval and flush buffer when shutting down', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    const handle = { unref: vi.fn() };
    const setIntervalMock = vi.fn().mockReturnValue(handle);
    const clearIntervalMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.stubGlobal('setInterval', setIntervalMock as unknown);
    vi.stubGlobal('clearInterval', clearIntervalMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test',
      flushIntervalMs: 100,
    });

    provider.log(createLogEvent());

    // Act
    await provider.shutdown();

    // Assert
    expect(setIntervalMock).toHaveBeenCalled();
    expect(handle.unref).toHaveBeenCalled();
    expect(clearIntervalMock).toHaveBeenCalledWith(handle);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('should invoke scheduled flush callback when interval fires', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    const handle = { unref: vi.fn() };
    const setIntervalMock = vi.fn().mockReturnValue(handle);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.stubGlobal('setInterval', setIntervalMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({
      name: 'http',
      endpoint: 'https://example.test/logs',
      flushIntervalMs: 100,
    });

    const event = createLogEvent();
    provider.log(event);

    // Act: trigger the scheduled handler manually
    const handler = setIntervalMock.mock.calls[0]?.[0] as () => void;
    handler();

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/logs', expect.any(Object));
  });

  it('should serialize non-Date timestamps without conversion', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock as unknown);
    vi.resetModules();
    const { HttpProvider } = await import(modulePath);
    const provider = new HttpProvider({ name: 'http', endpoint: 'https://example.test' });

    const numericTs = 1700000000000;
    const event = createLogEvent({ timestamp: numericTs as unknown as Date });

    // Act
    provider.log(event);
    await provider.flush();

    // Assert
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const payload = JSON.parse(body)[0];
    expect(payload.timestamp).toBe(numericTs);
  });
});
