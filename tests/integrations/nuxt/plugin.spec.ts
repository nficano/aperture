import { describe, it, expect, vi, beforeEach } from 'vitest';

const modulePath = '../../../src/integrations/nuxt/runtime/plugin.js';
const apertureKey = Symbol.for('aperture.instance');

describe('Nuxt plugin', () => {
  beforeEach(() => {
    (globalThis as Record<PropertyKey, unknown>)[apertureKey] = undefined;
    // @ts-expect-error removing window emulates server context
    delete globalThis.window;
  });

  const mockProvider = (
    path: string,
    exportName: string,
    providerName: string,
    optionsStore: Record<string, unknown[]>,
  ) => {
    vi.doMock(
      path,
      () => ({
        [exportName]: class {
          name = providerName;
          constructor(options: unknown) {
            (optionsStore[providerName] ??= []).push(options);
          }
        },
      }),
      { virtual: true },
    );
  };

  it('should bootstrap aperture and register providers when running on server', async () => {
    // Arrange
    const runtimeConfig = {
      aperture: {
        environment: 'production',
        defaultTags: { stage: 'beta' },
        release: '1.0.0',
        runtime: { region: 'us' },
        domains: [{ name: 'checkout' }],
        providers: {
          console: { enableColors: false },
          sentry: { dsn: 'https://key@sentry.io/1' },
          firebase: { collection: 'logs' },
          datadog: { apiKey: 'key', service: 'svc' },
          newRelic: { licenseKey: 'license', service: 'svc' },
        },
      },
    };

    const providerOptions: Record<string, unknown[]> = {};
    const registeredProviders: { name: string }[] = [];
    const registerMany = vi.fn();

    class ApertureStub {
      options: unknown;
      constructor(options: unknown) {
        this.options = options;
      }
      registerProvider(provider: { name: string }) {
        registeredProviders.push(provider);
      }
      listProviders() {
        return [];
      }
      getDomainRegistry() {
        return { registerMany } as const;
      }
      getLogger() {
        return { name: 'logger' };
      }
    }

    vi.resetModules();

    vi.doMock('#app', () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock('#imports', () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });
    vi.doMock('../../../core/Aperture.js', () => ({ Aperture: ApertureStub }), {
      virtual: true,
    });

    mockProvider(
      '../../../providers/ConsoleProvider.js',
      'ConsoleProvider',
      'console',
      providerOptions,
    );
    mockProvider(
      '../../../providers/FirebaseProvider.js',
      'FirebaseProvider',
      'firebase',
      providerOptions,
    );
    mockProvider(
      '../../../providers/SentryProvider.js',
      'SentryProvider',
      'sentry',
      providerOptions,
    );
    mockProvider(
      '../../../providers/DatadogProvider.js',
      'DatadogProvider',
      'datadog',
      providerOptions,
    );
    mockProvider(
      '../../../providers/NewRelicProvider.js',
      'NewRelicProvider',
      'newrelic',
      providerOptions,
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();
      expect(context.provide.aperture).toBeInstanceOf(ApertureStub);
      const apertureInstance = context.provide.aperture as ApertureStub;

      // Assert
      expect(apertureInstance.options).toMatchObject({
        environment: 'production',
        defaultTags: { stage: 'beta' },
        release: '1.0.0',
        runtime: { region: 'us' },
        domains: [{ name: 'checkout' }],
      });
      expect(registerMany).toHaveBeenCalledWith([{ name: 'checkout' }]);
      expect(registeredProviders.map((provider) => provider.name).sort()).toEqual(
        ['console', 'datadog', 'firebase', 'newrelic', 'sentry'].sort(),
      );
      expect(providerOptions.console?.[0]).toMatchObject({ enableColors: false });
      expect(context.provide.apertureLogger).toEqual({ name: 'logger' });
    } finally {
      vi.unmock('#app');
      vi.unmock('#imports');
      vi.unmock('../../../core/Aperture.js');
      vi.unmock('../../../providers/ConsoleProvider.js');
      vi.unmock('../../../providers/FirebaseProvider.js');
      vi.unmock('../../../providers/SentryProvider.js');
      vi.unmock('../../../providers/DatadogProvider.js');
      vi.unmock('../../../providers/NewRelicProvider.js');
    }
  });

  it('should reuse existing aperture instance when already initialised', async () => {
    // Arrange
    const existing = { getLogger: () => ({}) };
    (globalThis as Record<PropertyKey, unknown>)[apertureKey] = existing;

    vi.resetModules();

    vi.doMock('#app', () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock('#imports', () => ({ useRuntimeConfig: () => ({ aperture: {} }) }), {
      virtual: true,
    });

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();

      // Assert
      expect(context.provide.aperture).toBe(existing);
    } finally {
      vi.unmock('#app');
      vi.unmock('#imports');
    }
  });

  it('should skip server-only providers when running on client', async () => {
    // Arrange
    (globalThis as Record<PropertyKey, unknown>).window = {};
    const runtimeConfig = {
      aperture: {
        providers: {
          console: {},
          sentry: { dsn: 'https://key@sentry.io/1' },
        },
      },
    };

    const registerProviderSpy = vi.fn();

    class ApertureStub {
      registerProvider(provider: { name: string }) {
        registerProviderSpy(provider);
      }
      listProviders() {
        return [];
      }
      getDomainRegistry() {
        return { registerMany: vi.fn() };
      }
      getLogger() {
        return {};
      }
    }

    vi.resetModules();

    vi.doMock('#app', () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock('#imports', () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });
    vi.doMock('../../../core/Aperture.js', () => ({ Aperture: ApertureStub }), {
      virtual: true,
    });
    mockProvider(
      '../../../providers/ConsoleProvider.js',
      'ConsoleProvider',
      'console',
      {},
    );
    mockProvider(
      '../../../providers/SentryProvider.js',
      'SentryProvider',
      'sentry',
      {},
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      pluginFactory();

      // Assert
      expect(registerProviderSpy).toHaveBeenCalledTimes(1);
      expect(registerProviderSpy.mock.calls[0]?.[0]?.name).toBe('console');
    } finally {
      vi.unmock('#app');
      vi.unmock('#imports');
      vi.unmock('../../../core/Aperture.js');
      vi.unmock('../../../providers/ConsoleProvider.js');
      vi.unmock('../../../providers/SentryProvider.js');
    }
  });
});
