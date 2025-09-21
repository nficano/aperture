import { describe, it, expect } from 'vitest';
import { ApertureLogger } from '../../../src/core/logger/Logger.js';
import { ContextManager } from '../../../src/core/context/ContextManager.js';
import type { LogEvent } from '../../../src/types/index.js';

describe('ApertureLogger', () => {
  it('should emit log event with merged tags when logging info', () => {
    // Arrange
    const events: LogEvent[] = [];
    const provider = {
      name: 'memory',
      log: (event: LogEvent) => {
        events.push(event);
      },
    };
    const logger = new ApertureLogger(
      {
        environment: 'production',
        providers: [provider],
        defaultTags: { region: 'us-east' },
      },
      { tags: { release: '1.0.0' } },
    );

    // Act
    logger.info('service ready', {
      tags: { requestId: 'r-1' },
      context: { stage: 'startup' },
    });

    // Assert
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.level).toBe('info');
    expect(event.message).toBe('service ready');
    expect(event.tags).toEqual({ region: 'us-east', release: '1.0.0', requestId: 'r-1' });
    expect(event.runtime).toEqual({ environment: 'production' });
    expect(event.context).toEqual({ stage: 'startup' });
  });

  it('should propagate domain when creating a child logger with domain', () => {
    // Arrange
    const events: LogEvent[] = [];
    const provider = {
      name: 'memory',
      log: (event: LogEvent) => events.push(event),
    };
    const logger = new ApertureLogger({ providers: [provider], environment: 'test' });

    // Act
    const domainLogger = logger.withDomain('checkout');
    domainLogger.warn('slow response');

    // Assert
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.domain).toBe('checkout');
    expect(event.level).toBe('warn');
  });

  it('should merge runtime context when logging with active scope', () => {
    // Arrange
    const events: LogEvent[] = [];
    const provider = {
      name: 'memory',
      log: (event: LogEvent) => events.push(event),
    };
    const logger = new ApertureLogger({ providers: [provider], environment: 'test' });
    const error = new Error('boom');
    const instrumentation = {
      instrumentType: 'api-call',
      name: 'GET /users',
      status: 'start',
    } as const;

    // Act
    ContextManager.runWithContext(
      {
        domain: 'users',
        tags: { request: 'abc' },
        user: { id: 'u-1' },
        instrumentation,
      },
      () => {
        logger.error('request failed', {
          tags: { attempt: '1' },
          context: { correlationId: 'c-1' },
          error,
        });
      },
    );

    // Assert
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.domain).toBe('users');
    expect(event.tags).toEqual({ request: 'abc', attempt: '1' });
    expect(event.error).toBe(error);
    expect(event.instrumentation).toEqual(instrumentation);
    expect(event.context).toEqual({
      correlationId: 'c-1',
      domain: 'users',
      user: { id: 'u-1' },
      instrumentation,
    });
  });

  it('should merge tags when chaining child loggers', () => {
    // Arrange
    const events: LogEvent[] = [];
    const provider = {
      name: 'memory',
      log: (event: LogEvent) => events.push(event),
    };
    const logger = new ApertureLogger({ providers: [provider], environment: 'test' });

    // Act
    const tagged = logger.withTags({ release: '1.2.3' }).withImpact('performance');
    tagged.debug('timing check', {
      tags: { stage: 'beta' },
    });

    // Assert
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.impact).toBe('performance');
    expect(event.tags).toEqual({ release: '1.2.3', stage: 'beta' });
  });
});
