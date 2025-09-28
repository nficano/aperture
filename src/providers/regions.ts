export type DatadogRegion =
  | "us"
  | "us1"
  | "us3"
  | "us5"
  | "ap1"
  | "gov"
  | "eu"
  | "eu1";

export interface DatadogRegionConfig {
  site: string;
  log: string;
  metric: string;
}

const buildDatadogConfig = (site: string): DatadogRegionConfig => ({
  site,
  log: `https://http-intake.logs.${site}/api/v2/logs`,
  metric: `https://api.${site}/api/v2/series`,
});

export const datadogRegionConfigMap: Record<DatadogRegion, DatadogRegionConfig> = {
  us: buildDatadogConfig("datadoghq.com"),
  us1: buildDatadogConfig("datadoghq.com"),
  us3: buildDatadogConfig("us3.datadoghq.com"),
  us5: buildDatadogConfig("us5.datadoghq.com"),
  ap1: buildDatadogConfig("ap1.datadoghq.com"),
  gov: buildDatadogConfig("ddog-gov.com"),
  eu: buildDatadogConfig("datadoghq.eu"),
  eu1: buildDatadogConfig("datadoghq.eu"),
};

export const DEFAULT_DATADOG_REGION: DatadogRegion = "us1";

export function resolveDatadogRegion(
  region?: string | null
): DatadogRegionConfig | undefined {
  if (!region) return undefined;
  const key = region.toLowerCase() as DatadogRegion;
  return datadogRegionConfigMap[key];
}

export type NewRelicRegion = "us" | "eu";

export interface NewRelicRegionConfig {
  log: string;
  metric: string;
}

export const newRelicRegionConfigMap: Record<NewRelicRegion, NewRelicRegionConfig> = {
  us: {
    log: "https://log-api.newrelic.com/log/v1",
    metric: "https://metric-api.newrelic.com/metric/v1",
  },
  eu: {
    log: "https://log-api.eu.newrelic.com/log/v1",
    metric: "https://metric-api.eu.newrelic.com/metric/v1",
  },
};

export const DEFAULT_NEW_RELIC_REGION: NewRelicRegion = "us";

export function resolveNewRelicRegion(
  region?: string | null
): NewRelicRegionConfig | undefined {
  if (!region) return undefined;
  const key = region.toLowerCase() as NewRelicRegion;
  return newRelicRegionConfigMap[key];
}
