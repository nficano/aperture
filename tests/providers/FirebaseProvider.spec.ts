import { describe, it, expect, vi } from 'vitest';
import { createLogEvent, createMetricEvent, stubConsole } from '../_helpers.js';

const modulePath = '../../src/providers/FirebaseProvider.js';

describe('FirebaseProvider', () => {
  it('should use provided app when configuring Firestore', async () => {
    // Arrange
    const add = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn().mockReturnValue({ add });
    const firestore = vi.fn(() => ({ collection }));
    const app = { firestore };
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);
    const provider = new FirebaseProvider({ app, collection: 'custom' });

    // Act
    await provider.setup();
    await provider.log(createLogEvent());
    await provider.metric(createMetricEvent());

    // Assert
    expect(firestore).toHaveBeenCalled();
    expect(collection).toHaveBeenNthCalledWith(1, 'custom');
    expect(collection).toHaveBeenNthCalledWith(2, 'custom');
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('should initialize firebase-admin when app not provided', async () => {
    // Arrange
    const add = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn().mockReturnValue({ add });
    const firestoreInstance = { collection };
    const firestore = vi.fn(() => firestoreInstance);
    const initializeApp = vi.fn(() => ({ firestore }));

    vi.doMock('firebase-admin', () => ({
      default: {
        apps: [],
        initializeApp,
      },
    }), { virtual: true });
    vi.resetModules();
    const { FirebaseProvider: MockedProvider } = await import(modulePath);
    const provider = new MockedProvider({ collection: 'logs' });

    try {
      // Act
      await provider.setup();
      await provider.log(createLogEvent());

      // Assert
      expect(initializeApp).toHaveBeenCalled();
      expect(collection).toHaveBeenCalledWith('logs');
    } finally {
      vi.unmock('firebase-admin');
    }
  });

  it('should warn and disable provider when firebase-admin import fails', async () => {
    // Arrange
    const stub = stubConsole();
    vi.doMock('firebase-admin', () => { throw new Error('missing'); }, { virtual: true });
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);
    const provider = new FirebaseProvider();

    try {
      // Act
      await provider.setup();
      await provider.log(createLogEvent());

      // Assert
      expect(stub.calls.warn[0]?.[0]).toContain('[Aperture][Firebase]');
    } finally {
      stub.restore();
      vi.unmock('firebase-admin');
    }
  });

  it('should use existing app when firebase-admin has an initialized app', async () => {
    // Arrange
    const add = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn().mockReturnValue({ add });
    const firestoreInstance = { collection };
    const firestore = vi.fn(() => firestoreInstance);
    const existingApp = { firestore };
    vi.doMock(
      'firebase-admin',
      () => ({ default: { apps: [existingApp] } }),
      { virtual: true },
    );
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);
    const provider = new FirebaseProvider({ collection: 'events' });

    try {
      // Act
      await provider.setup();
      await provider.log(createLogEvent());

      // Assert
      expect(firestore).toHaveBeenCalled();
      expect(collection).toHaveBeenCalledWith('events');
      expect(add).toHaveBeenCalled();
    } finally {
      vi.unmock('firebase-admin');
    }
  });

  it('should not initialize when provided app lacks firestore and should no-op', async () => {
    // Arrange
    const app = {} as any; // no firestore()
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);
    const provider = new FirebaseProvider({ app });

    // Act
    await provider.setup();
    await provider.log(createLogEvent());
    await provider.metric(createMetricEvent());
    provider.flush();
    provider.shutdown();

    // Assert — nothing to assert other than absence of crashes
    expect(true).toBe(true);
  });

  it('should preserve non-Date timestamps during serialization', async () => {
    // Arrange
    const add = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn().mockReturnValue({ add });
    const firestore = vi.fn(() => ({ collection }));
    const app = { firestore } as any;
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);
    const provider = new FirebaseProvider({ app, collection: 'custom' });
    await provider.setup();

    const ts = 1700000000000;
    const event = createLogEvent({ timestamp: ts as unknown as Date });

    // Act
    await provider.log(event);

    // Assert
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ timestamp: ts }));
  });

  it('should fall back to NOOP logger when console is unavailable', async () => {
    // Arrange
    const originalConsole = globalThis.console as any;
    // @ts-expect-error - intentionally unset for test
    delete (globalThis as any).console;
    vi.resetModules();
    const { FirebaseProvider } = await import(modulePath);

    try {
      const provider = new FirebaseProvider({ app: undefined });
      await provider.setup();
      await provider.log(createLogEvent());
      expect(true).toBe(true);
    } finally {
      globalThis.console = originalConsole;
    }
  });
});
