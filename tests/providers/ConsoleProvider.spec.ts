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
