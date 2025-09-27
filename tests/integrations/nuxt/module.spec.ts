import { describe, it, expect, vi } from 'vitest';

const modulePath = '../../../src/integrations/nuxt/module.js';

describe('Nuxt module', () => {
  it('should register plugin and merge runtime config when enabled', async () => {
    // Arrange
    const addPlugin = vi.fn();
    const resolve = vi.fn().mockReturnValue('/plugin-path');
    const hook = vi.fn();
    const addServerHandler = vi.fn();
    const addImportsDir = vi.fn();

    vi.doMock('@nuxt/kit', () => ({
      defineNuxtModule: (config: any) => config,
      addPlugin,
      addServerHandler,
      addImportsDir,
      createResolver: () => ({ resolve }),
    }), { virtual: true });
    vi.resetModules();
    const module = (await import(modulePath)).default;
    const nuxt = {
      options: { runtimeConfig: {} },
      hook,
    } as any;

    const options = {
      enabled: true,
      environment: 'production',
      defaultTags: { stage: 'beta' },
      release: '1.0.0',
      runtime: { region: 'us' },
      domains: [{ name: 'app' }],
      providers: { console: true },
    };

    try {
      // Act
      module.setup(options, nuxt);
      const nitroHandler = hook.mock.calls[0]?.[1];
      const nitroConfig: any = { runtimeConfig: { aperture: { release: 'old' } } };
      nitroHandler?.(nitroConfig);

      // Assert
      expect(nuxt.options.runtimeConfig.aperture).toMatchObject({
        environment: 'production',
        defaultTags: { stage: 'beta' },
        release: '1.0.0',
        runtime: { region: 'us' },
        domains: [{ name: 'app' }],
        providers: { console: true },
      });
      expect(nuxt.options.runtimeConfig.aperture.tunnel).toEqual({
        path: '/api/aperture',
        jwtSecret: undefined,
        csrfHeader: undefined,
        sampling: undefined,
        rateLimitPerMin: undefined,
        debug: undefined,
      });
      expect(nitroConfig.runtimeConfig.aperture).toMatchObject({
        release: '1.0.0',
        environment: 'production',
        defaultTags: { stage: 'beta' },
        runtime: { region: 'us' },
        domains: [{ name: 'app' }],
        providers: { console: true },
      });
      expect(nitroConfig.runtimeConfig.aperture.tunnel).toEqual({
        path: '/api/aperture',
        jwtSecret: undefined,
        csrfHeader: undefined,
        sampling: undefined,
        rateLimitPerMin: undefined,
        debug: undefined,
      });
      expect(addPlugin).toHaveBeenCalledWith({ src: '/plugin-path', mode: 'all' });
    } finally {
      vi.unmock('@nuxt/kit');
    }
  });

  it('should skip registration when module is disabled', async () => {
    // Arrange
    const addPlugin = vi.fn();
    const hook = vi.fn();
    const addServerHandler = vi.fn();
    const addImportsDir = vi.fn();

    vi.doMock('@nuxt/kit', () => ({
      defineNuxtModule: (config: any) => config,
      addPlugin,
      addServerHandler,
      addImportsDir,
      createResolver: () => ({ resolve: vi.fn() }),
    }), { virtual: true });
    vi.resetModules();
    const module = (await import(modulePath)).default;

    try {
      // Act
      module.setup({ enabled: false }, { options: { runtimeConfig: {} }, hook } as any);

      // Assert
      expect(addPlugin).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
    } finally {
      vi.unmock('@nuxt/kit');
    }
  });

  it('should default domains/providers and merge nitro config when undefined', async () => {
    // Arrange
    const addPlugin = vi.fn();
    const resolve = vi.fn().mockReturnValue('/plugin-path');
    const hook = vi.fn();
    const addServerHandler = vi.fn();
    const addImportsDir = vi.fn();

    vi.doMock('@nuxt/kit', () => ({
      defineNuxtModule: (config: any) => config,
      addPlugin,
      addServerHandler,
      addImportsDir,
      createResolver: () => ({ resolve }),
    }), { virtual: true });
    vi.resetModules();
    const module = (await import(modulePath)).default;
    const nuxt = { options: { runtimeConfig: {} }, hook } as any;

    // Act
    module.setup({ enabled: true }, nuxt);
    const nitroHandler = hook.mock.calls[0]?.[1];
    const nitroConfig: any = {};
    nitroHandler?.(nitroConfig);

    // Assert
    expect(nuxt.options.runtimeConfig.aperture).toMatchObject({
      domains: [],
      providers: {},
    });
    expect(nuxt.options.runtimeConfig.aperture.tunnel).toEqual({
      path: '/api/aperture',
      jwtSecret: undefined,
      csrfHeader: undefined,
      sampling: undefined,
      rateLimitPerMin: undefined,
      debug: undefined,
    });
    expect(nitroConfig.runtimeConfig.aperture).toMatchObject({
      domains: [],
      providers: {},
    });
    expect(nitroConfig.runtimeConfig.aperture.tunnel).toEqual({
      path: '/api/aperture',
      jwtSecret: undefined,
      csrfHeader: undefined,
      sampling: undefined,
      rateLimitPerMin: undefined,
      debug: undefined,
    });
  });
});
