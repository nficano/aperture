import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../../../src/core/context/ContextManager.js';
import type { Logger } from '../../../src/types/index.js';

const modulePath = '../../../src/core/instruments/Instrumentation.js';

type FakeLogger = Logger & {
  child: ReturnType<typeof createFakeLogger>['child'];
};

const createFakeLogger = () => {
  const childInfo = vi.fn();
  const childError = vi.fn();
  const childWarn = vi.fn();
  const childDebug = vi.fn();

  const childLogger = {
    info: childInfo,
    error: childError,
    warn: childWarn,
    debug: childDebug,
  } as Logger;

  const base: FakeLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withDomain: vi.fn(),
    withTags: vi.fn(),
    withImpact: vi.fn(),
    child: vi.fn().mockReturnValue(childLogger),
  } as unknown as FakeLogger;

  return { base, childLogger, childInfo, childError };
};

describe('Instrumentation', () => {
  it('should run instrumented function when auto logging is enabled', async () => {
    // Arrange
    const { base, childInfo } = createFakeLogger();
    const { instrumentUserJourney } = await import(modulePath);
    const handle = instrumentUserJourney<number>(base, 'checkout', {
      domain: 'payments',
      impact: 'engagement',
      tags: { stage: 'beta' },
      metadata: { feature: 'checkout' },
    });

    // Act
    const result = await handle.run(() => 42);

    // Assert
    expect(result).toBe(42);
    expect(base.child).toHaveBeenCalled();
    expect(childInfo).toHaveBeenCalledWith('user-journey:checkout started', {
      impact: 'engagement',
    });
    expect(childInfo).toHaveBeenCalledWith('user-journey:checkout success', {
      impact: 'engagement',
      context: expect.objectContaining({ durationMs: expect.any(Number) }),
    });
  });

  it('should emit error log when instrumented function throws', async () => {
    // Arrange
    const { base, childError } = createFakeLogger();
    const { instrumentApiCall } = await import(modulePath);
    const handle = instrumentApiCall(base, 'GET /orders');
    const failure = new Error('request failed');

    // Act / Assert
    await expect(
      handle.run(() => {
        throw failure;
      }),
    ).rejects.toThrow(failure);

    expect(childError).toHaveBeenCalledWith('api-call:GET /orders error', {
      impact: undefined,
      error: failure,
      context: expect.objectContaining({ durationMs: expect.any(Number) }),
    });
  });

  it('should support manual steps and finish when auto logging disabled', async () => {
    // Arrange
    const { base, childInfo, childError } = createFakeLogger();
    const { instrumentFunnel } = await import(modulePath);
    const handle = instrumentFunnel(base, 'signup', {
      autoLog: false,
      tags: { initial: 'yes' },
    });

    handle.annotate({ extra: 'value' }).step({ step: 'validate', tags: { phase: 'mid' } });

    // Act
    await handle.run(() => {
      const context = ContextManager.getContext();
      expect(context.tags).toEqual({ initial: 'yes', extra: 'value', phase: 'mid' });
      handle.finish('success', { processed: true });
      return 'ok';
    });

    const output = handle.success('done', { count: 1 });

    // Assert
    expect(output).toBe('done');
    expect(childInfo).not.toHaveBeenCalled();
    expect(childError).not.toHaveBeenCalled();
  });

  it('should use Date.now fallback when performance API is unavailable', async () => {
    // Arrange
    vi.resetModules();
    vi.stubGlobal('performance', undefined as unknown);
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000);
    nowSpy.mockReturnValueOnce(1_150);
    const { instrumentConversion } = await import(modulePath);
    const { base, childInfo } = createFakeLogger();

    // Act
    const handle = instrumentConversion(base, 'purchase');
    handle.success();

    // Assert
    const successCall = childInfo.mock.calls.find(
      ([message]) => message === 'conversion:purchase success',
    );
    expect(successCall?.[1]).toEqual({
      impact: undefined,
      context: { durationMs: 150 },
    });
    expect(nowSpy).toHaveBeenCalled();
  });
});
