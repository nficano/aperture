import { vi } from 'vitest';
import type {
  ApertureProvider,
  LogEvent,
  MetricEvent,
  TagRecord,
} from '../src/types/index.js';

export const fixedDate = new Date('2024-01-01T00:00:00.000Z');

export const createLogEvent = (
  overrides: Partial<LogEvent> = {},
): LogEvent => ({
  level: 'info',
  message: 'test-message',
  timestamp: overrides.timestamp ?? new Date(fixedDate),
  domain: 'testing',
  impact: 'reliability',
  tags: overrides.tags ?? { feature: 'alpha' },
  context: overrides.context ?? { path: '/health' },
  runtime: overrides.runtime ?? { environment: 'test' },
  ...overrides,
});

export const createMetricEvent = (
  overrides: Partial<MetricEvent> = {},
): MetricEvent => ({
  name: 'test-metric',
  value: 1,
  unit: 'ms',
  timestamp: overrides.timestamp ?? new Date(fixedDate),
  domain: 'testing',
  impact: 'performance',
  tags: overrides.tags ?? { feature: 'alpha' },
  context: overrides.context ?? { stage: 'start' },
  ...overrides,
});

export const createCollectingProvider = () => {
  const events: Array<LogEvent | MetricEvent> = [];
  const provider: ApertureProvider & {
    events: Array<LogEvent | MetricEvent>;
  } = {
    name: 'collector',
    events,
    log: (event: LogEvent) => {
      events.push(event);
    },
    metric: (event: MetricEvent) => {
      events.push(event);
    },
    flush: vi.fn(),
    shutdown: vi.fn(),
  };

  return provider;
};

export const stubConsole = () => {
  const original = globalThis.console;
  const calls: Record<'log' | 'warn' | 'error' | 'info', unknown[][]> = {
    log: [],
    warn: [],
    error: [],
    info: [],
  };

  globalThis.console = {
    ...original,
    log: (...args: unknown[]) => calls.log.push(args),
    warn: (...args: unknown[]) => calls.warn.push(args),
    error: (...args: unknown[]) => calls.error.push(args),
    info: (...args: unknown[]) => calls.info.push(args),
  } as Console;

  return {
    calls,
    restore: () => {
      globalThis.console = original;
    },
  };
};

export const combineTags = (
  ...records: Array<TagRecord | undefined>
): Record<string, unknown> => {
  return records.reduce<Record<string, unknown>>((acc, record) => {
    if (!record) return acc;
    for (const [key, value] of Object.entries(record)) {
      acc[key] = value;
    }
    return acc;
  }, {});
};
