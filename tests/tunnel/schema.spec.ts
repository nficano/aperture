import { describe, it, expect } from 'vitest';
import { validateEnvelope } from '../../src/tunnel/schema.js';

describe('schema.validateEnvelope', () => {
  it('accepts a valid log', () => {
    const env = validateEnvelope({ schema: 'aperture.v1', kind: 'log', ts: Date.now(), level: 'info', message: 'ok' });
    expect(env.kind).toBe('log');
  });

  it('rejects invalid kind', () => {
    // @ts-expect-error testing invalid
    expect(() => validateEnvelope({ schema: 'aperture.v1', kind: 'noop', ts: Date.now() })).toThrow();
  });
});

