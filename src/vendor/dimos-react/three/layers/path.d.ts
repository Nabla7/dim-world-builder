import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { Store } from '../store.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
/** `lift`: m above the floor */
export interface PathSettings {
    color: string;
    width: number;
    lift: number;
}
/** One point of a path */
export type PathPoint = [x: number, y: number, z: number];
/** Points of a path (decoded data: any shape): nav_msgs.Path `poses` (PoseStamped), Poses, {x,y,z} or [x,y,z]. */
export declare function pathPoints(poses: Iterable<any> | null | undefined): PathPoint[];
export declare class PathLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<PathSettings>;
    context: LayerContext;
    /** `topic` null: data comes through setData */
    constructor(context: LayerContext, topic: Topic | null, settings: Store<PathSettings>);
    /** Props data: `{ poses, frame?, timestamp? }` or the poses themselves (any shape pathPoints reads). */
    setData(data: any): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export declare function PathSettingsEditor({ settings }: LayerSettingsProps<PathSettings>): import('react').JSX.Element;
/** A stable, distinct color per name, as a hex string (paths, arrays, boxes of one class). */
export declare function colorFor(name: unknown): THREE.Color;
