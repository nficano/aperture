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
});
