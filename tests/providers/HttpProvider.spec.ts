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
});
