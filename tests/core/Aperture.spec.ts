import { describe, it, expect, vi } from 'vitest';
import type { ApertureProvider } from '../../src/types/index.js';
import { stubConsole } from '../_helpers.js';

const modulePath = '../../src/core/Aperture.js';
const contextModulePath = '../../src/core/context/ContextManager.js';

const loadAperture = async () => (await import(modulePath)).Aperture;
const loadContextManager = async () =>
  (await import(contextModulePath)).ContextManager;

const firstMessage = (entries: unknown[][]) => String((entries[0] ?? [])[0] ?? '');

describe('Aperture', () => {
  it('should initialize domains and providers when constructed with options', async () => {
    // Arrange
    const Aperture = await loadAperture();
    const setup = vi.fn();
    const provider: ApertureProvider = {
      name: 'collector',
      setup,
    };

    // Act
    const aperture = new Aperture({
      environment: 'production',
      release: 'v1',
      runtime: { region: 'us' },
      defaultTags: { service: 'api' },
      domains: [
        {
          name: 'billing',
          defaultImpact: 'revenue',
          defaultTags: { tier: 'pro' },
        },
      ],
      providers: [provider],
    });

    // Assert
    expect(setup).toHaveBeenCalledWith({
      environment: 'production',
      release: 'v1',
      runtime: { region: 'us' },
    });
    expect(aperture.getDomainRegistry().get('billing')).toMatchObject({
      defaultImpact: 'revenue',
      defaultTags: { tier: 'pro' },
    });
    expect(aperture.listProviders()).toEqual(['collector']);
    expect(aperture.getLogger()).toBeDefined();
  });

  it('should derive environment from process when option omitted', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');
    const Aperture = await loadAperture();
    const aperture = new Aperture();

    // Act
    const provider: ApertureProvider = { name: 'noop' };
    aperture.registerProvider(provider);

    // Assert
    expect(aperture.listProviders()).toContain('noop');
  });

  it('should log setup failures when provider throws during registration', async () => {
    // Arrange
    vi.resetModules();
    const { calls, restore } = stubConsole();
    const Aperture = await loadAperture();
    const faulty: ApertureProvider = {
      name: 'faulty',
      setup: () => {
        throw new Error('fail');
      },
    };
    const aperture = new Aperture({ environment: 'development' });

    try {
      // Act
      aperture.registerProvider(faulty);
    } finally {
      restore();
    }

    // Assert
    expect(calls.error).toHaveLength(1);
    expect(firstMessage(calls.error)).toContain(
      '[Aperture] Failed to setup provider faulty',
    );
    expect(aperture.listProviders()).toContain('faulty');
  });

  it('should log setup failures when provider promise rejects', async () => {
    // Arrange
    vi.resetModules();
    const { calls, restore } = stubConsole();
    const Aperture = await loadAperture();
    const faulty: ApertureProvider = {
      name: 'async-faulty',
      setup: () => Promise.reject(new Error('async fail')),
    };
    const aperture = new Aperture({ environment: 'development' });

    try {
      // Act
      aperture.registerProvider(faulty);
      await Promise.resolve();
    } finally {
      restore();
    }

    // Assert
    expect(calls.error).toHaveLength(1);
    expect(firstMessage(calls.error)).toContain(
      '[Aperture] Failed to setup provider async-faulty',
    );
  });

  it('should remove provider and run shutdown when removing by name', async () => {
    // Arrange
    const Aperture = await loadAperture();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const provider: ApertureProvider = { name: 'temp', shutdown };
    const aperture = new Aperture();
    aperture.registerProvider(provider);

    // Act
    aperture.removeProvider('temp');
    await Promise.resolve();

    // Assert
    expect(shutdown).toHaveBeenCalled();
    expect(aperture.listProviders()).not.toContain('temp');
  });

  it('should log shutdown failures when provider shutdown rejects', async () => {
    // Arrange
    vi.resetModules();
    const { calls, restore } = stubConsole();
    const Aperture = await loadAperture();
    const shutdown = vi.fn().mockRejectedValue(new Error('stop'));
    const provider: ApertureProvider = { name: 'temp', shutdown };
    const aperture = new Aperture();
    aperture.registerProvider(provider);

    try {
      // Act
      aperture.removeProvider('temp');
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      restore();
    }

    // Assert
    expect(calls.error).toHaveLength(1);
    expect(firstMessage(calls.error)).toContain(
      '[Aperture] Failed to shutdown provider temp',
    );
  });

  it('should flush all providers when flush is invoked', async () => {
    // Arrange
    const Aperture = await loadAperture();
    const flushOne = vi.fn().mockResolvedValue(undefined);
    const flushTwo = vi.fn().mockReturnValue(undefined);
    const aperture = new Aperture();
    aperture.registerProvider({ name: 'one', flush: flushOne });
    aperture.registerProvider({ name: 'two', flush: flushTwo });

    // Act
    await aperture.flush();

    // Assert
    expect(flushOne).toHaveBeenCalled();
    expect(flushTwo).toHaveBeenCalled();
  });

  it('should apply domain defaults when running within a domain scope', async () => {
    // Arrange
    const Aperture = await loadAperture();
    const ContextManager = await loadContextManager();
    const aperture = new Aperture({
      domains: [
        {
          name: 'checkout',
          defaultImpact: 'revenue',
          defaultTags: { stage: 'beta' },
        },
      ],
    });

    // Act
    const result = aperture.withDomain('checkout', () => ContextManager.getContext());

    // Assert
    expect(result).toEqual({
      domain: 'checkout',
      impact: 'revenue',
      tags: { stage: 'beta' },
    });
    expect(ContextManager.getContext()).toEqual({});
  });

  it('should merge provided context when using withContext', async () => {
    // Arrange
    const Aperture = await loadAperture();
    const ContextManager = await loadContextManager();
    const aperture = new Aperture();

    // Act
    const scope = aperture.withContext(
      {
        domain: 'profile',
        tags: { stage: 'gamma' },
      },
      () => ContextManager.getContext(),
    );

    // Assert
    expect(scope).toEqual({
      domain: 'profile',
      tags: { stage: 'gamma' },
    });
    expect(ContextManager.getContext()).toEqual({});
  });
});
