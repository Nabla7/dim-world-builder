import * as THREE from "three";
/** The three.js layer channel the on-top pass draws; the scene's own pass draws channel 0. */
export declare const ON_TOP_CHANNEL = 1;
/** What OnTopPass needs of a WebGLRenderer. */
export interface PassRenderer {
    autoClear: boolean;
    render(scene: THREE.Object3D, camera: THREE.Camera): void;
    clearDepth(): void;
}
export declare class OnTopPass {
    #private;
    /** `object` and everything under it (children added later too) on top, or back in the scene. */
    set(object: THREE.Object3D, on: boolean): void;
    has(object: THREE.Object3D): boolean;
    /** The scene, then (when anything is on top) the on-top objects over it. Lights must be on ON_TOP_CHANNEL too. */
    render(renderer: PassRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
}
