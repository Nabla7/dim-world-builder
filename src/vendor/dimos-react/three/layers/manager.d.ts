import { DataSource, ListedTopic, Topic } from '../../data.ts';
import { Store } from '../store.ts';
import { LayerStatus, LayerType } from './registry.ts';
/** A topic's settings bag: whatever its layer type keeps (see LayerType's `S`). */
export interface LayerEntry {
    topic: Topic;
    type: LayerType;
    enabled: boolean;
    status: LayerStatus;
    settings: Store<any>;
}
/** Saves a Store under `key` (fields missing from what's saved come from `defaults`); localStore by default. */
export type Persist = <T extends object>(key: string, defaults: T) => Store<T>;
export interface LayerManagerOptions {
    source: DataSource;
    persist?: Persist;
    storagePrefix?: string;
    forgetMs?: number;
}
export declare class LayerManager {
    #private;
    entries: Store<{
        list: LayerEntry[];
    }>;
    /** every topic seen (drawn or not), sorted by name */
    topics: Store<{
        list: Topic[];
    }>;
    /** the 3D view is off: no layer runs (nothing subscribed); the switches keep what to start again */
    paused: Store<{
        paused: boolean;
    }>;
    forgetMs: number;
    source: DataSource;
    constructor({ source, persist, storagePrefix, forgetMs, }: LayerManagerOptions);
    /** Lists the source's topics now and every `intervalMs` (and on the source's topic events). Returns stop. */
    watch({ filter, intervalMs }?: {
        filter?: string;
        intervalMs?: number;
    }): () => void;
    /** Topics found (`[{ key }]` or `[{ key, name, type }]`): new drawable ones become entries; gone ones are kept for `forgetMs`. */
    setTopics(found: ListedTopic[]): void;
    /** Switches a topic's layer on (subscribes) or off (unsubscribes); remembered. */
    setEnabled(key: string, enabled: boolean): void;
    /** Off: every layer stops; on: the enabled ones start again. */
    setPaused(paused: boolean): void;
    /** Topics of these types being drawn (e.g. to pick a robot pose source). */
    enabledOfType(...types: string[]): Topic[];
    /** The drawn layers' data frames (for the TF check). */
    layerFrames(): {
        name: string;
        frame: string;
    }[];
    /** A layer reports info / a problem / its frame (only real changes re-render). */
    setStatus(key: string, status: LayerStatus): void;
    /** A layer stopped: its info and problem go with it. */
    clearStatus(key: string): void;
}
