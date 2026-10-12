import { ReactNode } from 'react';
import { AppZenoh, ConnectionState, GetZenohOptions } from './vendor/dim-app/zenoh.js';
export type { AppZenoh };
/** A source's connection state: "connecting" | "connected" | "degraded" | "lost". */
export type SourceState = ConnectionState;
/** A dimos topic: its zenoh key, its name ("/odom") and LCM type ("nav_msgs.Odometry"). */
export interface Topic {
    key: string;
    name: string;
    type: string;
}
/** A topic a source lists (`{ key }`, plus whatever else the source knows about it). */
export interface ListedTopic {
    key: string;
    [field: string]: unknown;
}
/**
 * One message off a source: zenoh-gateway's `{ key, bytes, timestamp, … }`. `decoded` is the gateway's own decoding
 * (encodings like dimos_lcm_pointcloud2); `value` is what an in-page source was given (not bytes).
 */
export interface Message {
    key: string;
    bytes: Uint8Array;
    timestamp?: number;
    kind?: string;
    seq?: number;
    decoded?: unknown;
    value?: unknown;
}
/** What a frontend-topic callback gets alongside the payload. */
export interface FrontendMessage {
    key: string;
    timestamp?: number;
}
/** How a message becomes a value (see decodeMessage). */
export type Decoder = "auto" | "decoded" | "lcm" | "json" | "text" | "bytes" | ((message: Message) => any);
/** Options a source's subscribe takes (zenoh-gateway's: delivery, maxHz, encoding, encodeOptions, minQuality, …). */
export interface SubscribeOptions {
    delivery?: "latest" | "reliable";
    maxHz?: number;
    encoding?: string;
    encodeOptions?: Record<string, unknown>;
    minQuality?: number;
    [option: string]: unknown;
}
/** A source's subscribe returns this: call it (or `.unsubscribe()`) to stop; `.update(changes)` changes options. */
export type Subscription = (() => void) & {
    unsubscribe(): void;
    update(changes: Record<string, unknown>): Promise<void>;
};
/** A pose topic's whole recorded route: `points` are `[tSeconds, x, y, z]`. */
export interface Route {
    frame: string;
    points: [number, number, number, number][];
}
/** Where live data comes from (zenohSource, memorySource, or anything with this shape). */
export interface DataSource {
    kind: string;
    readonly state: ConnectionState;
    /** a replay: `now()` is the playhead, so staleness, fading and lifetimes follow it (not the wall clock) */
    replay?: boolean;
    subscribe(key: string, options: SubscribeOptions | undefined, onMessage: (message: Message) => void): Subscription;
    subscribeFrontend(topic: string, callback: (payload: any, message: FrontendMessage) => void, options?: Record<string, unknown>): () => void;
    listTopics(filter?: string, options?: {
        probeMs?: number;
    }): Promise<ListedTopic[]>;
    onState(listener: (state: ConnectionState) => void): () => void;
    onReconnect?(listener: () => void): () => void;
    /** the topic list changed (a source that knows, rather than has to probe) */
    onTopics?(listener: () => void): () => void;
    now(): number;
    seek?(): void;
    onSeek?(listener: () => void): () => void;
    route?: ((key: string) => Route | null | Promise<Route | null>) | null;
}
/** The live source (zenohSource): `zenoh` is the page's dim-app connection. */
export interface ZenohSource extends DataSource {
    kind: "zenoh";
    readonly zenoh: AppZenoh;
    onReconnect(listener: () => void): () => void;
}
/** The in-page source (memorySource). */
export interface MemorySource extends DataSource {
    kind: "memory";
    state: ConnectionState;
    replay: boolean;
    onReconnect(listener: () => void): () => void;
    onTopics(listener: () => void): () => void;
    seek(): void;
    onSeek(listener: () => void): () => void;
    route: ((key: string) => Route | null | Promise<Route | null>) | null;
    /** Delivers a message to every subscriber whose key expression matches `key`. */
    publish(key: string, payload: unknown, options?: {
        timestamp?: number;
    }): void;
    /** What the app backend's publishFrontend(topic, payload) does: JSON to `subscribeFrontend(topic)` listeners. */
    publishFrontend(topic: string, payload: unknown): void;
    setTopics(keys: string[]): void;
    setState(next: ConnectionState): void;
}
export interface MemorySourceOptions {
    topics?: string[];
    state?: ConnectionState;
    /** the playhead (ms): makes the source a replay */
    clock?: () => number;
    route?: (key: string) => Route | null | Promise<Route | null>;
}
/** `dimos/<name>/<type>` → `{ key, name: "/<name>", type }`; anything else → null. */
export declare function parseKey(key: string): Topic | null;
/** The zenoh key dimos uses for a topic of a type: dimosKey("/odom", "nav_msgs.Odometry"). */
export declare const dimosKey: (topic: string, type: string) => string;
/** zenoh key-expression matching (`*` = one chunk, `**` = any number of chunks). */
export declare function keyMatches(pattern: string, key: string): boolean;
/**
 * Turns a message into a value: "lcm" (dimos LCM, the type from the key or `type`), "json", "text", "bytes", or a
 * function `(message) => value`. A message the gateway already decoded (an encoding like dimos_lcm_pointcloud2)
 * keeps `message.decoded`.
 */
export declare function decodeMessage(message: Message, how?: Decoder, type?: string): any;
/**
 * The live source: the page's one zenoh-gateway connection (dim-app's getZenoh(), shared with everything else on the
 * page). `options` go to getZenoh on first use (app, connectOptions, …).
 */
export declare function zenohSource(options?: GetZenohOptions): ZenohSource;
/**
 * An in-page source: whatever calls `publish` is the data (tests, demos, a replay app feeding recorded messages).
 * `publish(key, payload)` takes bytes (LCM etc.), or any value (delivered as `message.value`, decoded as itself).
 * A replay passes `clock` (the playhead, ms: `now()` returns it), calls `seek()` when the playhead jumps and may pass
 * `route(key)` (a pose topic's whole recorded route) so the 3D view can draw it.
 */
export declare function memorySource({ topics, state, clock, route, }?: MemorySourceOptions): MemorySource;
export interface DataSourceProviderProps {
    source: DataSource;
    children?: ReactNode;
}
/** Makes `source` the data source of everything below. */
export declare function DataSourceProvider({ source, children }: DataSourceProviderProps): import('react').FunctionComponentElement<import('react').ProviderProps<DataSource | null>>;
export interface ZenohProviderProps extends GetZenohOptions {
    children?: ReactNode;
}
/** DataSourceProvider with the live zenoh-gateway source (props go to getZenoh on first use). */
export declare function ZenohProvider({ children, ...options }: ZenohProviderProps): import('react').FunctionComponentElement<import('react').ProviderProps<DataSource | null>>;
/** The data source in effect: the nearest provider's, else the page's zenoh-gateway connection. */
export declare function useDataSource(): DataSource;
/** The zenoh connection behind the source (dim-app's AppZenoh), or null for a non-zenoh source. */
export declare function useZenoh(): AppZenoh | null;
export interface UseSubscriptionOptions extends SubscribeOptions {
    /** how a message becomes a value (decodeMessage's `how`) */
    decode?: Decoder;
    /** the LCM type, when the key doesn't say */
    type?: string;
}
/**
 * Calls `onMessage(value, message)` for every message on `key` (null key: nothing). The callback may change freely.
 * @param key a zenoh key expression
 */
export declare function useSubscription<T = any>(key: string | null | undefined, onMessage: (value: T, message: Message) => void, options?: UseSubscriptionOptions): void;
export interface UseTopicOptions<T = any> extends UseSubscriptionOptions {
    /** the value before the first message */
    initial?: T;
}
/** The latest message on a topic and its decoded value (`initial` until the first message). */
export interface TopicState<T = any> {
    value: T | undefined;
    message: Message | null;
    timestamp: number | null;
    count: number;
}
/** The latest message on a topic, re-rendered per message (throttle with `maxHz`). */
export declare function useTopic<T = any>(key: string | null | undefined, options?: UseTopicOptions<T>): TopicState<T>;
/**
 * The dimos topics on the bus (`[{ key, name, type }]`, sorted), re-listed every `intervalMs`. A topic stays listed
 * `forgetMs` after it was last seen (slow publishers miss a probe now and then).
 */
export declare function useTopicList({ filter, intervalMs, forgetMs, types, }?: {
    filter?: string;
    intervalMs?: number;
    forgetMs?: number;
    types?: string[];
}): Topic[];
/** The source's connection state: "connecting" | "connected" | "degraded" | "lost". */
export declare function useConnectionState(): ConnectionState;
/**
 * The app backend's events (dim-app's publishEvent / publishFrontend("events", …)): `onEvent(event)` per event.
 * `onReconnect` runs when the link comes back (events sent while it was down are gone: re-GET what you show).
 */
export declare function useBackendEvents(onEvent: (event: any) => void, { topic, onReconnect }?: {
    topic?: string;
    onReconnect?: () => void;
}): void;
export interface UseBackendStateOptions<T = any> {
    /** where to GET the snapshot (default `api/state/<key>`) */
    url?: string;
    /** the frontend topic announcing changes (default `state/<key>`) */
    topic?: string;
    /** the value before the first GET answers */
    initial?: T;
    debounceMs?: number;
    fetch?: typeof fetch;
}
/** useBackendState's second element. */
export interface BackendStateStatus {
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}
/**
 * Snapshot + live backend state (dim-app's convention): GET `api/state/<key>` (or `url`), then re-GET whenever the
 * backend's stateChanged(key) announces a change on the frontend topic `state/<key>`, and after a reconnect.
 */
export declare function useBackendState<T = any>(key: string | null | undefined, { url, topic, initial, debounceMs, fetch: fetchImpl }?: UseBackendStateOptions<T>): [T | undefined, BackendStateStatus];
