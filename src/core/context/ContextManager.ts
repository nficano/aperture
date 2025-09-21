import type {
  ApertureContext,
  Domain,
  ImpactType,
  TagRecord,
} from "../../types/index.js";

type StorageAdapter = {
  run<T>(value: ApertureContext, fn: () => T): T;
  getStore(): ApertureContext | undefined;
};

const storage = createStorage();

type AsyncLocalConstructor = new <Store>() => {
  run<Result>(store: Store, fn: () => Result): Result;
  getStore(): Store | undefined;
};

/**
 * Creates a storage adapter backed by AsyncLocalStorage when available or a stack fallback.
 * @returns {StorageAdapter} Adapter providing run/getStore helpers for context propagation.
 */
function createStorage(): StorageAdapter {
  const AsyncLocal = (
    globalThis as {
      AsyncLocalStorage?: AsyncLocalConstructor;
    }
  ).AsyncLocalStorage;

  if (typeof AsyncLocal === "function") {
    const instance = new AsyncLocal<ApertureContext>();
    return {
      /**
       * Executes a callback with a scoped store using AsyncLocalStorage.
       * @template T
       * @param {ApertureContext} value - Context value to make active.
       * @param {() => T} fn - Callback executed within the scope.
       * @returns {T} The callback result.
       */
      run: (value, fn) => instance.run(value, fn),
      /**
       * Retrieves the current AsyncLocalStorage store.
       * @returns {ApertureContext | undefined} Current context or undefined.
       */
      getStore: () => instance.getStore(),
    };
  }

  const stack: ApertureContext[] = [];

  return {
    /**
     * Executes a callback while pushing the provided context onto a stack.
     * @template T
     * @param {ApertureContext} value - Context to push for the duration of the callback.
     * @param {() => T} fn - Callback that runs while the context is active.
     * @returns {T} The callback result.
     */
    run<T>(value: ApertureContext, fn: () => T): T {
      stack.push(value);
      try {
        return fn();
      } finally {
        stack.pop();
      }
    },
    /**
     * Reads the currently active context from the stack fallback.
     * @returns {ApertureContext | undefined} Current context or undefined when none set.
     */
    getStore(): ApertureContext | undefined {
      return stack.length ? stack[stack.length - 1] : undefined;
    },
  };
}

/**
 * Manages scoped context propagation for logging operations.
 */
export class ContextManager {
  /**
   * Runs a callback with the provided context merged into the active store.
   * @template T
   * @param {ApertureContext} context - Context to merge for the callback scope.
   * @param {() => T} fn - Callback executed with the merged context.
   * @returns {T} The callback result.
   */
  static runWithContext<T>(context: ApertureContext, fn: () => T): T {
    const current = storage.getStore() ?? {};
    const merged: ApertureContext = {
      ...current,
      ...context,
      tags: {
        ...(current.tags ?? {}),
        ...(context.tags ?? {}),
      },
    };

    return storage.run(merged, fn);
  }

  /**
   * Runs a callback while injecting a domain into the active context.
   * @template T
   * @param {Domain} domain - Domain to apply for the callback scope.
   * @param {() => T} fn - Callback executed with the domain context.
   * @returns {T} The callback result.
   */
  static withDomain<T>(domain: Domain, fn: () => T): T {
    return ContextManager.runWithContext({ domain }, fn);
  }

  /**
   * Runs a callback with a specific impact level applied to the context.
   * @template T
   * @param {ImpactType} impact - Impact classification for the scope.
   * @param {() => T} fn - Callback executed while the impact is active.
   * @returns {T} The callback result.
   */
  static withImpact<T>(impact: ImpactType, fn: () => T): T {
    return ContextManager.runWithContext({ impact }, fn);
  }

  /**
   * Runs a callback while merging additional tags into the context.
   * @template T
   * @param {TagRecord} tags - Tags to merge for the callback scope.
   * @param {() => T} fn - Callback executed while the tags are active.
   * @returns {T} The callback result.
   */
  static withTags<T>(tags: TagRecord, fn: () => T): T {
    return ContextManager.runWithContext({ tags }, fn);
  }

  /**
   * Runs a callback with user information merged into the active context.
   * @template T
   * @param {NonNullable<ApertureContext["user"]>} user - User metadata to apply.
   * @param {() => T} fn - Callback executed while the user context is active.
   * @returns {T} The callback result.
   */
  static withUser<T>(
    user: NonNullable<ApertureContext["user"]>,
    fn: () => T,
  ): T {
    return ContextManager.runWithContext({ user }, fn);
  }

  /**
   * Retrieves the currently active context snapshot.
   * @returns {ApertureContext} Current context or an empty object when unset.
   */
  static getContext(): ApertureContext {
    return storage.getStore() ?? {};
  }

  /**
   * Merges provided context data with the currently active context.
   * @param {ApertureContext} context - Context values to merge.
   * @returns {ApertureContext} Combined context object.
   */
  static mergeWithContext(context: ApertureContext): ApertureContext {
    const current = ContextManager.getContext();
    return {
      ...current,
      ...context,
      tags: {
        ...(current.tags ?? {}),
        ...(context.tags ?? {}),
      },
    };
  }
}
