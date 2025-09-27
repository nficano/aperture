import type {
  ProviderCapabilities,
  ProviderFallbackConfig,
  ProviderSupportMatrix,
} from "../types/index.js";

export interface ProviderManifestEntry {
  capabilities: ProviderCapabilities;
  defaultFallbacks?: ProviderFallbackConfig;
}

const FULL: ProviderSupportMatrix = {
  logs: "full",
  metrics: "full",
  traces: "full",
};

const LIMITED_METRICS: ProviderSupportMatrix = {
  logs: "full",
  metrics: "limited",
  traces: "full",
};

const CONSOLE_SUPPORT: ProviderSupportMatrix = {
  logs: "full",
  metrics: "limited",
  traces: "limited",
};

const FIREBASE_CLIENT_SUPPORT: ProviderSupportMatrix = {
  logs: "full",
  metrics: "limited",
  traces: "limited",
};

const FIREBASE_SERVER_SUPPORT: ProviderSupportMatrix = {
  logs: "limited",
  metrics: "limited",
  traces: "limited",
};

export const PROVIDER_MANIFEST: Record<string, ProviderManifestEntry> = {
  console: {
    capabilities: {
      client: CONSOLE_SUPPORT,
      server: CONSOLE_SUPPORT,
    },
    defaultFallbacks: {
      forceLogMetrics: true,
      forceLogTraces: true,
    },
  },
  datadog: {
    capabilities: {
      client: FULL,
      server: FULL,
    },
  },
  newrelic: {
    capabilities: {
      client: FULL,
      server: FULL,
    },
  },
  sentry: {
    capabilities: {
      client: LIMITED_METRICS,
      server: LIMITED_METRICS,
    },
  },
  firebase: {
    capabilities: {
      client: FIREBASE_CLIENT_SUPPORT,
      server: FIREBASE_SERVER_SUPPORT,
    },
    defaultFallbacks: {
      fallbackToClient: true,
    },
  },
};

export function getProviderManifest(
  name: string,
): ProviderManifestEntry | undefined {
  return PROVIDER_MANIFEST[name];
}
