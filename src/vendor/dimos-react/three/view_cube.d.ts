import { Viewer } from './viewer.ts';
import * as THREE from "three";
export type ViewCubeCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";
/** A spot on the cube: each axis -1, 0 or 1 (a face has one non-zero, an edge two, a corner three). */
export type CubeRegion = [number, number, number];
/** how much of the cube's half-size counts as an edge or corner band (the rest of a face is the face) */
export declare const EDGE_BAND = 0.3;
/** The region under a point on the cube's surface (cube-local, half-size 1). */
export declare function cubeRegion(point: {
    x: number;
    y: number;
    z: number;
}, band?: number): CubeRegion;
/** "Top", "Front Right", "Top Front Left", ... */
export declare function regionLabel([x, y, z]: CubeRegion): string;
/**
 * The direction to look from (target → camera, unit) for a region. Straight above or below gets a hair of -y, so the
 * screen's up stays +y (OrbitControls can't look exactly along its up axis).
 */
export declare function regionDirection([x, y, z]: CubeRegion): THREE.Vector3;
/** The highlight box of a region: its center and size, cube-local, a little proud of the surface. */
export declare function regionBox(region: CubeRegion, band?: number): {
    center: THREE.Vector3;
    size: THREE.Vector3;
};
export interface ViewCubeOptions {
    corner?: ViewCubeCorner;
    /** CSS pixels */
    size?: number;
}
export declare class ViewCube {
    #private;
    readonly canvas: HTMLCanvasElement;
    constructor(viewer: Viewer, parent: HTMLElement, { corner, size }?: ViewCubeOptions);
    /** Re-reads the theme's colors (faces, edges, hover). */
    setTheme(): void;
    dispose(): void;
}
