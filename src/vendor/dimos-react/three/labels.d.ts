import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from "three";
export declare class LabelPool {
    #private;
    group: THREE.Group<THREE.Object3DEventMap>;
    className: string;
    constructor(className?: string);
    /** Call before placing a message's labels; `end()` hides the ones not reused. */
    begin(): void;
    /**
     * @param color any CSS color (a token like "var(--warn)" works)
     */
    place(text: string, position: THREE.Vector3, color?: string): CSS2DObject;
    end(): void;
    dispose(): void;
}
