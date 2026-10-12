import { DepthImage, DepthLook } from './depth_types.ts';
import * as THREE from "three";
export type { DepthImage, DepthLook, DepthPixels } from './depth_types.ts';
/** Tracks the automatic range (2nd–98th percentile of valid depth, eased) so it doesn't flicker frame to frame. */
export declare class DepthRange {
    #private;
    near: number;
    far: number;
    /** @param look fixed range (meters), null = automatic */
    update(image: {
        width: number;
        height: number;
        encoding: string;
        data: ArrayLike<number>;
    }, look: {
        near: number | null;
        far: number | null;
    }): [number, number];
}
/** A depth texture colored the same way, as a three.js material (`.material`); `update(image, look)` per image. */
export declare class DepthMaterial {
    #private;
    material: THREE.ShaderMaterial;
    constructor();
    update(image: DepthImage, look?: DepthLook): void;
    dispose(): void;
}
