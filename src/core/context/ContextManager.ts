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

const GLOBAL_STACK_KEY = "__APERTURE_CONTEXT_STORAGE_STACK__" as const;
const GLOBAL_ALS_KEY = "__APERTURE_CONTEXT_STORAGE_ALS__" as const;

function getOrCreateGlobalStorage(): StorageAdapter {
  const g = globalThis as unknown as Record<string, unknown>;
  const hasALS =
    typeof (globalThis as { AsyncLocalStorage?: AsyncLocalConstructor })
      .AsyncLocalStorage === "function";
  if (hasALS) {
    const existingAls = g[GLOBAL_ALS_KEY] as StorageAdapter | undefined;
    if (existingAls) return existingAls;
    const createdAls = createALSStorage();
    g[GLOBAL_ALS_KEY] = createdAls;
    return createdAls;
  }

  const existingStack = g[GLOBAL_STACK_KEY] as StorageAdapter | undefined;
  if (existingStack) return existingStack;
  const createdStack = createStackStorage();
  g[GLOBAL_STACK_KEY] = createdStack;
  return createdStack;
}

const storage = getOrCreateGlobalStorage();

type AsyncLocalConstructor = new <Store>() => {
  run<Result>(store: Store, fn: () => Result): Result;
  getStore(): Store | undefined;
};

/**
 * Creates a storage adapter backed by AsyncLocalStorage when available or a stack fallback.
 * @returns {StorageAdapter} Adapter providing run/getStore helpers for context propagation.
 */
function createALSStorage(): StorageAdapter {
  const AsyncLocal = (
    globalThis as { AsyncLocalStorage?: AsyncLocalConstructor }
  ).AsyncLocalStorage!;
  const instance = new AsyncLocal<ApertureContext>();
  return {
    run: (value, fn) => instance.run(value, fn),
    getStore: () => instance.getStore(),
  };
}

function createStackStorage(): StorageAdapter {
  const stack: ApertureContext[] = [];
  return {
    run<T>(value: ApertureContext, fn: () => T): T {
      stack.push(value);
      try {
        return fn();
      } finally {
        stack.pop();
      }
    },
    getStore(): ApertureContext | undefined {
      return stack.length > 0 ? stack.at(-1) : undefined;
    },
  };
}

/**
 * Manages scoped context propagation for logging operations.
 */
export const ContextManager = {
  /**
   * Runs a callback with the provided context merged into the active store.
   * @template T
   * @param {ApertureContext} context - Context to merge for the callback scope.
   * @param {() => T} fn - Callback executed with the merged context.
   * @returns {T} The callback result.
   */
  runWithContext<T>(context: ApertureContext, fn: () => T): T {
    const current = storage.getStore() ?? {};
    const merged: ApertureContext = {
      ...current,
      ...context,
      // Ensure tags are merged shallowly
      tags: {
        ...current.tags,
        ...context.tags,
      },
      // Ensure instrumentation from the new context is preserved
      instrumentation: context.instrumentation ?? current.instrumentation,
    };

    return storage.run(merged, fn);
  },

  /**
   * Runs a callback while injecting a domain into the active context.
   * @template T
   * @param {Domain} domain - Domain to apply for the callback scope.
   * @param {() => T} fn - Callback executed with the domain context.
   * @returns {T} The callback result.
   */
  withDomain<T>(domain: Domain, fn: () => T): T {
    return ContextManager.runWithContext({ domain }, fn);
  },

  /**
   * Runs a callback with a specific impact level applied to the context.
   * @template T
   * @param {ImpactType} impact - Impact classification for the scope.
   * @param {() => T} fn - Callback executed while the impact is active.
   * @returns {T} The callback result.
   */
  withImpact<T>(impact: ImpactType, fn: () => T): T {
    return ContextManager.runWithContext({ impact }, fn);
  },

  /**
   * Runs a callback while merging additional tags into the context.
   * @template T
   * @param {TagRecord} tags - Tags to merge for the callback scope.
   * @param {() => T} fn - Callback executed while the tags are active.
   * @returns {T} The callback result.
   */
  withTags<T>(tags: TagRecord, fn: () => T): T {
    return ContextManager.runWithContext({ tags }, fn);
  },

  /**
   * Runs a callback with user information merged into the active context.
   * @template T
   * @param {NonNullable<ApertureContext["user"]>} user - User metadata to apply.
   * @param {() => T} fn - Callback executed while the user context is active.
   * @returns {T} The callback result.
   */
  withUser<T>(user: NonNullable<ApertureContext["user"]>, fn: () => T): T {
    return ContextManager.runWithContext({ user }, fn);
  },

  /**
   * Retrieves the currently active context snapshot.
   * @returns {ApertureContext} Current context or an empty object when unset.
   */
  getContext(): ApertureContext {
    return storage.getStore() ?? {};
  },

  /**
   * Merges provided context data with the currently active context.
   * @param {ApertureContext} context - Context values to merge.
   * @returns {ApertureContext} Combined context object.
   */
  mergeWithContext(context: ApertureContext): ApertureContext {
    const current = ContextManager.getContext();
    return {
      ...current,
      ...context,
      // Merge tags from both sources
      tags: {
        ...current.tags,
        ...context.tags,
      },
      // Prefer explicitly provided instrumentation, otherwise keep current
      instrumentation: context.instrumentation ?? current.instrumentation,
    };
  },
};
