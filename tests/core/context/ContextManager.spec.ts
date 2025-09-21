import { describe, it, expect, vi } from 'vitest';

const modulePath = '../../../src/core/context/ContextManager.js';

describe('ContextManager', () => {
  it('should merge nested context when running with runWithContext', async () => {
    // Arrange
    const { ContextManager } = await import(modulePath);

    // Act
    const result = ContextManager.runWithContext(
      { domain: 'root', tags: { scope: 'root' } },
      () =>
        ContextManager.runWithContext(
          { impact: 'reliability', tags: { phase: 'child' } },
          () => {
            const active = ContextManager.getContext();
            return { active, merged: ContextManager.mergeWithContext({}) };
          },
        ),
    );

    // Assert
    expect(result.active).toEqual({
      domain: 'root',
      impact: 'reliability',
      tags: { scope: 'root', phase: 'child' },
    });
    expect(result.merged).toEqual({
      domain: 'root',
      impact: 'reliability',
      tags: { scope: 'root', phase: 'child' },
    });
    expect(ContextManager.getContext()).toEqual({});
  });

  it('should restore previous context when nested scope exits', async () => {
    // Arrange
    const { ContextManager } = await import(modulePath);

    // Act
    ContextManager.runWithContext({ domain: 'outer' }, () => {
      ContextManager.runWithContext({ domain: 'inner' }, () => undefined);
      const active = ContextManager.getContext();

      // Assert (inside scope)
      expect(active.domain).toBe('outer');
    });

    // Assert (after scope)
    expect(ContextManager.getContext()).toEqual({});
  });

  it('should apply domain and impact when using helper methods', async () => {
    // Arrange
    const { ContextManager } = await import(modulePath);

    // Act
    ContextManager.withDomain('checkout', () => {
      expect(ContextManager.getContext().domain).toBe('checkout');
      ContextManager.withImpact('performance', () => {
        expect(ContextManager.getContext().impact).toBe('performance');
        ContextManager.withTags({ stage: 'beta' }, () => {
          expect(ContextManager.getContext().tags).toEqual({ stage: 'beta' });
          ContextManager.withUser({ id: '42' }, () => {
            expect(ContextManager.getContext().user).toEqual({ id: '42' });
          });
        });
      });
    });

    // Assert
    expect(ContextManager.getContext()).toEqual({});
  });

  it('should merge context overrides when calling mergeWithContext', async () => {
    // Arrange
    const { ContextManager } = await import(modulePath);

    // Act
    ContextManager.runWithContext(
      { impact: 'reliability', tags: { request: 'r1' } },
      () => {
        const merged = ContextManager.mergeWithContext({
          impact: 'performance',
          tags: { feature: 'checkout' },
        });

        // Assert
        expect(merged.impact).toBe('performance');
        expect(merged.tags).toEqual({ request: 'r1', feature: 'checkout' });
      },
    );
  });

  it('should use async local storage when implementation is available', async () => {
    // Arrange
    class FakeAsyncLocalStorage<Store> {
      static instances: FakeAsyncLocalStorage<unknown>[] = [];
      private store: Store | undefined;

      constructor() {
        FakeAsyncLocalStorage.instances.push(this);
      }

      run<Result>(store: Store, fn: () => Result): Result {
        const previous = this.store;
        this.store = store;
        try {
          return fn();
        } finally {
          this.store = previous;
        }
      }

      getStore(): Store | undefined {
        return this.store;
      }
    }

    vi.stubGlobal('AsyncLocalStorage', FakeAsyncLocalStorage as unknown);
    vi.resetModules();
    const { ContextManager } = await import(modulePath);

    // Act
    ContextManager.runWithContext({ domain: 'als' }, () => {
      // Assert (inside scope)
      expect(ContextManager.getContext().domain).toBe('als');
    });

    // Assert
    expect(ContextManager.getContext()).toEqual({});
    expect(FakeAsyncLocalStorage.instances).toHaveLength(1);
  });
});
