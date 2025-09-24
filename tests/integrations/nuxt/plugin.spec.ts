import { describe, it, expect, vi, beforeEach } from "vitest";

const modulePath = "../../../src/integrations/nuxt/runtime/plugin.js";
const apertureKey = Symbol.for("aperture.instance");

type ProviderOptionsStore = Record<string, unknown[]>;

const providerModules = {
  console: "../../../providers/ConsoleProvider.js",
  sentry: "../../../providers/SentryProvider.js",
  firebase: "../../../providers/FirebaseProvider.js",
  datadog: "../../../providers/DatadogProvider.js",
  newrelic: "../../../providers/NewRelicProvider.js",
};

const mockProvider = (
  modulePath: string,
  exportName: string,
  providerName: string,
  store: ProviderOptionsStore
) => {
  vi.doMock(
    modulePath,
    () => ({
      [exportName]: class {
        name = providerName;
        constructor(options: unknown) {
          (store[providerName] ??= []).push(options);
        }
      },
    }),
    { virtual: true }
  );
};

describe("Nuxt plugin", () => {
  beforeEach(() => {
    (globalThis as Record<PropertyKey, unknown>)[apertureKey] = undefined;
    // @ts-expect-error removing window emulates server context
    delete (globalThis as Record<PropertyKey, unknown>).window;
  });

  it("should bootstrap aperture and register providers when running on server", async () => {
    // Arrange
    const runtimeConfig = {
      aperture: {
        environment: "production",
        defaultTags: { stage: "beta" },
        release: "1.0.0",
        runtime: { region: "us" },
        domains: [{ name: "checkout" }],
        providers: {
          console: { enableColors: false },
          sentry: { dsn: "https://key@sentry.io/1" },
          firebase: { collection: "logs" },
          datadog: { apiKey: "key", service: "svc" },
          newRelic: { licenseKey: "license", service: "svc" },
        },
      },
    };

    const providerOptions: ProviderOptionsStore = {};

    vi.resetModules();
    vi.doMock("#app", () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock("#imports", () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });

    mockProvider(
      providerModules.console,
      "ConsoleProvider",
      "console",
      providerOptions
    );
    mockProvider(
      providerModules.sentry,
      "SentryProvider",
      "sentry",
      providerOptions
    );
    mockProvider(
      providerModules.firebase,
      "FirebaseProvider",
      "firebase",
      providerOptions
    );
    mockProvider(
      providerModules.datadog,
      "DatadogProvider",
      "datadog",
      providerOptions
    );
    mockProvider(
      providerModules.newrelic,
      "NewRelicProvider",
      "newrelic",
      providerOptions
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();
      const aperture = context.provide.aperture;

      // Assert
      expect(aperture.listProviders().sort()).toEqual(
        ["console", "datadog", "firebase", "newrelic", "sentry"].sort()
      );
      expect(aperture.getDomainRegistry().list()).toEqual([
        { name: "checkout" },
      ]);
      // expect(providerOptions.console?.[0]).toMatchObject({ enableColors: false });
      // expect(providerOptions.datadog?.[0]).toMatchObject({ apiKey: 'key', service: 'svc' });
      expect(context.provide.apertureLogger).toBeTruthy();
    } finally {
      vi.unmock("#app");
      vi.unmock("#imports");
      vi.unmock("../../../providers/ConsoleProvider.js");
      vi.unmock("../../../providers/SentryProvider.js");
      vi.unmock("../../../providers/FirebaseProvider.js");
      vi.unmock("../../../providers/DatadogProvider.js");
      vi.unmock("../../../providers/NewRelicProvider.js");
    }
  });

  it("should reuse existing aperture instance when already initialised", async () => {
    // Arrange
    const existing = {
      listProviders: () => ["existing"],
      getLogger: () => ({}),
    } as const;
    (globalThis as Record<PropertyKey, unknown>)[apertureKey] = existing;

    vi.resetModules();
    vi.doMock("#app", () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock(
      "#imports",
      () => ({ useRuntimeConfig: () => ({ aperture: {} }) }),
      {
        virtual: true,
      }
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();

      // Assert
      expect(context.provide.aperture).toBe(existing);
    } finally {
      vi.unmock("#app");
      vi.unmock("#imports");
    }
  });

  it("should skip server-only providers when running on client", async () => {
    // Arrange
    (globalThis as Record<PropertyKey, unknown>).window = {};
    const runtimeConfig = {
      aperture: {
        providers: {
          console: {},
          sentry: { dsn: "https://key@sentry.io/1" },
        },
      },
    };

    const providerOptions: ProviderOptionsStore = {};

    vi.resetModules();
    vi.doMock("#app", () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock("#imports", () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });

    mockProvider(
      providerModules.console,
      "ConsoleProvider",
      "console",
      providerOptions
    );
    mockProvider(
      providerModules.sentry,
      "SentryProvider",
      "sentry",
      providerOptions
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();

      // Assert
      expect(context.provide.aperture.listProviders()).toEqual(["console"]);
      expect(providerOptions.sentry?.length ?? 0).toBe(0);
    } finally {
      vi.unmock("#app");
      vi.unmock("#imports");
      vi.unmock("../../../providers/ConsoleProvider.js");
      vi.unmock("../../../providers/SentryProvider.js");
      vi.unmock("../../../providers/FirebaseProvider.js");
      vi.unmock("../../../providers/DatadogProvider.js");
      vi.unmock("../../../providers/NewRelicProvider.js");
    }
  });

  it("should enable console with default options when configured true", async () => {
    // Arrange
    const runtimeConfig = { aperture: { providers: { console: true } } };
    const providerOptions: ProviderOptionsStore = {};

    vi.resetModules();
    vi.doMock("#app", () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock("#imports", () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });
    mockProvider(
      providerModules.console,
      "ConsoleProvider",
      "console",
      providerOptions
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();

      // Assert
      expect(context.provide.aperture.listProviders()).toContain("console");
    } finally {
      vi.unmock("#app");
      vi.unmock("#imports");
      vi.unmock("../../../providers/ConsoleProvider.js");
    }
  });

  it("should enable console by default when providers are undefined", async () => {
    // Arrange
    const runtimeConfig = { aperture: {} };
    const providerOptions: ProviderOptionsStore = {};

    vi.resetModules();
    vi.doMock("#app", () => ({ defineNuxtPlugin: (fn: any) => fn }), {
      virtual: true,
    });
    vi.doMock("#imports", () => ({ useRuntimeConfig: () => runtimeConfig }), {
      virtual: true,
    });
    mockProvider(
      providerModules.console,
      "ConsoleProvider",
      "console",
      providerOptions
    );

    const pluginFactory = (await import(modulePath)).default;

    try {
      // Act
      const context = pluginFactory();

      // Assert
      expect(context.provide.aperture.listProviders()).toContain("console");
    } finally {
      vi.unmock("#app");
      vi.unmock("#imports");
      vi.unmock("../../../providers/ConsoleProvider.js");
    }
  });
});
