import { LayerContext, Topic } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
/** One entity in an EntityMarkers message (dimos's JSON). */
export interface EntityMarker {
    id: string | number;
    type: string;
    label: unknown;
    x: number;
    y: number;
    z: number;
}
/** A point as drawn: a sphere and a label at `position`, colored by `color` (any CSS color or token). */
export interface LabeledPoint {
    label: string;
    color: string;
    position: THREE.Vector3;
}
/** A point from props, placed through TF from `frame` (the fixed frame when absent). */
export interface LabeledPointData {
    label?: string;
    position?: [number, number, number];
    frame?: string;
    color?: string;
}
/** EntityMarkers bytes (u32 big-endian length + JSON) → `{ label, color, position }[]`. */
export declare function entitiesOf(bytes: Uint8Array): LabeledPoint[];
export declare class LabeledPoints {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    context: LayerContext;
    constructor(context: LayerContext, topic: Topic | null);
    /** Points from props (no topic): `[{ label, position: [x, y, z], frame, color }]`. */
    setData(data: unknown): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
