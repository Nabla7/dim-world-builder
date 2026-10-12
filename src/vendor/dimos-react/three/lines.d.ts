import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import * as THREE from "three";
export interface FatLinesOptions {
    width: number;
    color?: THREE.ColorRepresentation;
    vertexColors?: boolean;
    capacity?: number;
    opacity?: number;
    dashed?: boolean;
    worldUnits?: boolean;
}
/** A segment color: any { r, g, b } in 0-1 (a THREE.Color fits). */
export interface RgbColor {
    r: number;
    g: number;
    b: number;
}
export declare class FatLines {
    #private;
    object: LineSegments2;
    material: LineMaterial;
    count: number;
    /**
     * @param resolution the view size in CSS px (Viewer.resolution), shared so widths stay in px
     */
    constructor(resolution: THREE.Vector2, options: FatLinesOptions);
    clear(): void;
    /** Appends one segment (and its color when the lines have vertex colors). */
    push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color?: RgbColor | null): void;
    /** Drops the oldest `count` segments (a trail over its limit). */
    shift(count: number): void;
    /** Uploads what changed since the last commit. */
    commit(): void;
    dispose(): void;
}
/** Twelve edges of a box centered at the origin with full sizes (x, y, z), pushed into `lines` through `matrix`. */
export declare function pushBox(lines: FatLines, matrix: THREE.Matrix4, size: {
    x: number;
    y: number;
    z: number;
}, color?: RgbColor | null): void;
