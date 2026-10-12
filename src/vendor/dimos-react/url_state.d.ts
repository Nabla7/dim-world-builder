import { ReactNode } from 'react';
import { DataSource } from './data.ts';
/** Where the params live: the query string ("search") or the hash ("hash": #a=1&b=2). */
export type UrlMode = "search" | "hash";
/** The URL's params as a plain object of strings. */
export type UrlParams = Record<string, string>;
/** Param changes: a value is written as a string (objects as JSON); null / undefined / "" remove the param. */
export type UrlChanges = Record<string, unknown>;
/** How a change is written: `replace` uses replaceState (no new history entry), `clear` drops the other params. */
export interface UrlSetOptions {
    replace?: boolean;
    clear?: boolean;
}
/** The parts of a window the URL store uses (the real window, or createMemoryWindow()). */
export interface UrlWindow {
    location: {
        readonly href: string;
    };
    history: {
        readonly state: unknown;
        pushState(state: unknown, title: string, href: string): void;
        replaceState(state: unknown, title: string, href: string): void;
    };
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}
/** The URL as a store (createUrlStore). */
export interface UrlStore {
    mode: UrlMode;
    href(): string;
    /** the params (the same object until the URL changes) */
    get(): UrlParams;
    subscribe(listener: () => void): () => void;
    /** true if the URL changed */
    set(changes: UrlChanges, options?: UrlSetOptions): boolean;
    /** Applies a backend url event; true if the URL changed. */
    applyEvent(event: unknown, options?: {
        eventType?: string;
    }): boolean;
}
/** The params of `href` as a plain object of strings. */
export declare function parseUrlState(href: string, { mode }?: {
    mode?: UrlMode;
}): UrlParams;
/** `href` with `changes` applied (null / undefined / "" remove a param; `clear` drops every other param first). */
export declare function urlWith(href: string, changes: UrlChanges | null | undefined, { mode, clear }?: {
    mode?: UrlMode;
    clear?: boolean;
}): string;
/** A backend url event (`type` is "url" unless the provider says otherwise); `params` is an older name for `set`. */
export interface UrlEvent {
    type: string;
    set?: UrlChanges;
    params?: UrlChanges;
    replace?: boolean;
    clear?: boolean;
}
/**
 * What a backend event does to the URL: `{ href, replace }`, or null if it isn't a url event (or changes nothing).
 * @param href the current URL
 * @param event a backend event (anything; only `{ type: eventType, … }` objects count)
 */
export declare function applyUrlEvent(href: string, event: unknown, { mode, eventType }?: {
    mode?: UrlMode;
    eventType?: string;
}): {
    href: string;
    replace: boolean;
} | null;
/** What a memory window's listeners get: `{ type, state }` (the history entry's state). */
export type MemoryWindowListener = (event: {
    type: string;
    state: unknown;
}) => void;
/**
 * A window stand-in with a working location + history (pushState, replaceState, back, forward, go → popstate), for
 * tests and server rendering.
 */
export declare function createMemoryWindow(initialHref?: string): {
    location: {
        readonly href: string;
        readonly search: string;
        readonly hash: string;
        readonly pathname: string;
    };
    history: {
        readonly length: number;
        readonly state: unknown;
        pushState(state: unknown, _title: string, href: string | URL): void;
        replaceState(state: unknown, _title: string, href: string | URL): void;
        go(delta: number): void;
        back(): void;
        forward(): void;
    };
    addEventListener(type: string, listener: MemoryWindowListener): void;
    removeEventListener(type: string, listener: MemoryWindowListener): void;
};
/**
 * The URL as a store: `get()` → params (the same object until the URL changes), `subscribe(listener)`,
 * `set(changes, { replace, clear })`, `applyEvent(event)`, `href()`. Follows back/forward (popstate, hashchange).
 */
export declare function createUrlStore({ window: win, mode, }?: {
    window?: UrlWindow;
    mode?: UrlMode;
}): UrlStore;
/**
 * Wires a data source's backend events to a URL store (non-React pages): every url event on the frontend topic
 * `topic` changes the URL. Returns unsubscribe.
 */
export declare function bindUrlEvents(source: DataSource, store: UrlStore, { topic, eventType }?: {
    topic?: string;
    eventType?: string;
}): () => void;
export interface UrlStateProviderProps {
    mode?: UrlMode;
    /** the window whose URL is the state (tests: createMemoryWindow()) */
    window?: UrlWindow;
    /** a ready-made store */
    store?: UrlStore;
    /** the frontend topic of the backend's url events, or false for none */
    events?: string | boolean;
    eventType?: string;
    children?: ReactNode;
}
/**
 * Provides the URL store below it and (unless `events={false}`) lets the app's backend change the URL with url events
 * on its `events` frontend topic (`events` may name another topic). `window` (tests: createMemoryWindow()) and
 * `mode` ("search" | "hash") pick where the params live; `store` passes a ready-made one.
 */
export declare function UrlStateProvider({ mode, window: win, store: givenStore, events, eventType, children, }: UrlStateProviderProps): import('react').JSX.Element;
/** The URL store in effect (the provider's, else one over the real window). */
export declare function useUrlStore(): UrlStore;
/** `[params, setParams(changes, { replace, clear })]`: every URL param, re-rendered on any URL change. */
export declare function useUrlParams(): [UrlParams, (changes: UrlChanges, options?: UrlSetOptions) => boolean];
/** How one param's value is read from and written to its text (`format` → null removes the param). */
export interface UrlCodec<T = any> {
    parse(text: string): T | undefined;
    format(value: T): string | null;
}
export type UrlCodecName = "string" | "number" | "boolean" | "json";
export interface UseUrlStateOptions<T> {
    codec?: UrlCodecName | UrlCodec<T>;
    replace?: boolean;
}
/** useUrlState's setter: a value or `(old) => value`; options as UrlStore.set's. */
export type UrlStateSetter<T> = (next: T | ((old: T) => T), options?: UrlSetOptions) => void;
/**
 * One URL param as state: `const [tab, setTab] = useUrlState("tab", "map")`. The default isn't written to the URL
 * (setting it back removes the param). `codec`: "string" (default) | "number" | "boolean" | "json" | { parse, format };
 * `replace: true` for values that change often (a scrubber, a camera pose) so they don't flood history.
 */
export declare function useUrlState<T = string>(key: string, defaultValue: T, options?: UseUrlStateOptions<T>): [T, UrlStateSetter<T>];
export declare function useUrlState<T = string>(key: string, defaultValue?: T, options?: UseUrlStateOptions<T>): [T | undefined, UrlStateSetter<T | undefined>];
