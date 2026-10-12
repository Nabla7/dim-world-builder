export declare class Store<T> {
    #private;
    constructor(value: T);
    get(): T;
    set(value: T): void;
    update(patch: Partial<T>): void;
    subscribe: (listener: () => void) => (() => void);
}
/** The store's current value, re-rendered on every change. */
export declare function useStore<T>(store: Store<T>): T;
/**
 * localStorage JSON, or the fallback (private windows and blocked storage throw or return nothing). The saved JSON is
 * trusted to have the fallback's shape.
 */
export declare function readLocal<T>(key: string, fallback: T): T;
/** Saves JSON to localStorage; without storage the value lasts for this page only. */
export declare function writeLocal(key: string, value: unknown): void;
/**
 * A Store saved in localStorage under `key` (fields missing from what's saved come from `defaults`). Apps that keep
 * settings elsewhere (a backend) pass their own `persist(key, defaults)` to the components that take one.
 */
export declare function localStore<T>(key: string, defaults: T): Store<T>;
