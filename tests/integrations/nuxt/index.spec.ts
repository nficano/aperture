import { describe, it, expect, vi } from 'vitest';

describe('Nuxt integration index re-exports', () => {
  it('should export default and named module', async () => {
    // Mock @nuxt/kit to satisfy module import
    vi.doMock('@nuxt/kit', () => ({
      defineNuxtModule: (config: any) => config,
      addPlugin: () => undefined,
      createResolver: () => ({ resolve: () => '' }),
    }), { virtual: true });
    const mod = await import('../../../src/integrations/nuxt/index.js');
    expect(typeof mod.default).toBe('object');
    expect(mod.apertureModule).toBe(mod.default);
  });
});
