import { Matrix4 } from 'three';
/** A dynamic edge older than this is "stale" (tf_static is exempt: it publishes rarely). */
export declare const STALE_MS = 2000;
/** Frames commonly used as the world, in preference order, when picking a default fixed frame. */
export declare const WORLD_NAMES: string[];
export interface TfProblems {
    doubleParent: [string, string[]][];
    roots: string[];
    cycle: string[];
    stale: string[];
}
export interface TfSnapshotEdge {
    parent: string;
    child: string;
    isStatic: boolean;
    ageMs: number;
}
export interface TfSnapshot {
    frames: string[];
    edges: TfSnapshotEdge[];
    problems: TfProblems;
}
export declare class TfTree {
    #private;
    /** bumped on every change, so layers know when to re-place what they drew */
    version: number;
    now: () => number;
    /** @param options `now`: the clock (ms) for staleness; tests pass a fake one */
    constructor({ now }?: {
        now?: () => number;
    });
    /**
     * Sets T_parent_child.
     * @param rotation quaternion x, y, z, w
     */
    set(parent: string, child: string, translation: [number, number, number], rotation: [number, number, number, number], isStatic?: boolean): void;
    /**
     * Feeds a decoded tf2_msgs.TFMessage (or an array of geometry_msgs.TransformStamped).
     */
    setMessage(message: any, isStatic?: boolean): void;
    /** Forgets every edge. */
    clear(): void;
    /** `listener(version)` after every change. Returns unsubscribe. */
    onChange(listener: (version: number) => void): () => void;
    /** Whether the tree knows `frame` (as a child or a parent). */
    has(frame: string): boolean;
    /** The parent of `frame`, or null for a root / unknown frame. */
    parentOf(frame: string): string | null;
    /**
     * T_fixed_frame: places data in `frame` into the fixed frame. An empty frame or the fixed frame itself is identity;
     * null when there is no path (different trees, unknown frame, a cycle). The result is cached: don't mutate it.
     */
    lookup(frame: string, fixed: string): Matrix4 | null;
    /** The fixed frame to default to: a world-ish root if there is one, else the root of the biggest tree. */
    defaultFixedFrame(): string;
    /** Every frame name, sorted. */
    frames(): string[];
    snapshot(): TfSnapshot;
}
