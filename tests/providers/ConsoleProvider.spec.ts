import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent, stubConsole } from '../_helpers.js';

const modulePath = '../../src/providers/ConsoleProvider.js';

describe('ConsoleProvider', () => {
  it('should emit structured JSON when environment is production', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider({ redactKeys: ['context'] });
      provider.setup({ environment: 'production' } as any);
      const event = createLogEvent({ context: { secret: 'value' } });

      // Act
      provider.log(event);

      // Assert
      expect(stub.calls.log).toHaveLength(1);
      const payload = JSON.parse(String(stub.calls.log[0][0]));
      expect(payload.context).toBe('[REDACTED]');
      expect(payload.level).toBe('info');
      expect(payload.message).toBe('test-message');
    } finally {
      stub.restore();
    }
  });

  it('should include instrumentation and error in development output', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);

      const error = new Error('kaboom');
      const event = createLogEvent({
        instrumentation: { sdk: 'aperture', version: '1.0.0' },
        error,
      });

      // Act
      provider.log(event);

      // Assert
      const line = String(stub.calls.log[0][0]);
      expect(line).toContain('instrument=');
      expect(line).toContain('error=');
    } finally {
      stub.restore();
    }
  });

  it('should handle string instrumentation via fast-path render', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);
      const event = createLogEvent({ instrumentation: 'runtime:node' } as any);

      // Act
      provider.log(event);

      // Assert
      const line = String(stub.calls.log[0][0]);
      expect(line).toContain('instrument=runtime:node');
    } finally {
      stub.restore();
    }
  });

  it('should render tags even when JSON serialization fails', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);

      // BigInt in an object will cause JSON.stringify to throw
      const event = createLogEvent({ tags: { bad: BigInt(1) as unknown as number } });

      // Act
      provider.log(event);

      // Assert
      const line = String(stub.calls.log[0][0]);
      expect(line).toContain('tags=');
    } finally {
      stub.restore();
    }
  });

  it('should disable colors when enableColors=false', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider({ enableColors: false });
      provider.setup({ environment: 'development' } as any);

      // Act
      provider.log(createLogEvent());

      // Assert
      const line = String(stub.calls.log[0][0]);
      expect(line).toContain('[INFO]');
      expect(line).not.toContain('\u001B');
    } finally {
      stub.restore();
    }
  });

  it('should format metrics in development with tags and impact', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);

      // Act
      provider.metric(
        createMetricEvent({ tags: { request: 'r1' }, impact: 'performance' }),
      );

      // Assert
      const line = String(stub.calls.log[0][0]);
      expect(line).toContain('[METRIC]');
      expect(line).toContain('impact=performance');
      expect(line).toContain('tags=');
    } finally {
      stub.restore();
    }
  });

  it('should not crash when console is unavailable (fallback console)', async () => {
    // Arrange
    const originalConsole = globalThis.console as any;
    // Remove console before module import to exercise fallback
    // @ts-expect-error - intentionally unset for test
    delete (globalThis as any).console;
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);
      provider.log(createLogEvent());
      provider.metric(createMetricEvent());
      provider.flush();
      provider.shutdown();
      // If no throw, fallback worked
      expect(true).toBe(true);
    } finally {
      globalThis.console = originalConsole;
    }
  });

  it('should render readable output when environment is development', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider();
      provider.setup({ environment: 'development' } as any);
      const event = createLogEvent({
        impact: 'performance',
        tags: { request: 'r1' },
        context: { stage: 'beta' },
      });

      // Act
      provider.log(event);

      // Assert
      expect(stub.calls.log).toHaveLength(1);
      const [line] = stub.calls.log[0];
      expect(String(line)).toContain('[INFO]');
      expect(String(line)).toContain('domain=testing');
      expect(String(line)).toContain('impact=performance');
      expect(String(line)).toContain('tags=');
      expect(String(line)).toContain('ctx=');
    } finally {
      stub.restore();
    }
  });

  it('should redact configured keys when logging metrics in production', async () => {
    // Arrange
    const stub = stubConsole();
    vi.resetModules();
    const { ConsoleProvider } = await import(modulePath);

    try {
      const provider = new ConsoleProvider({ redactKeys: ['value'] });
      provider.setup({ environment: 'production' } as any);
      const metric = createMetricEvent({ value: 99 });

      // Act
      provider.metric(metric);

      // Assert
      expect(stub.calls.log).toHaveLength(1);
      const payload = JSON.parse(String(stub.calls.log[0][0]));
      expect(payload.type).toBe('metric');
      expect(payload.value).toBe('[REDACTED]');
    } finally {
      stub.restore();
    }
  });
});
