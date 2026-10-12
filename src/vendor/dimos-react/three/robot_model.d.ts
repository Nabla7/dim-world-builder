import * as THREE from "three";
export declare const ROBOT_KINDS: string[];
/** A model's colors: CSS colors or tokens like "var(--primary)". */
export interface RobotModelColors {
    body?: string;
    dark?: string;
    nose?: string;
}
/** A CSS color (or a token like "var(--primary)") as a THREE.Color; `fallback` when it can't be resolved. */
export declare function cssColor(value: string | null | undefined, fallback?: string): THREE.Color;
/**
 * A stand-in model of `kind` (ROBOT_KINDS), or null for an unknown kind.
 * @param colors CSS colors or tokens
 */
export declare function robotModel(kind: string, colors?: RobotModelColors): THREE.Group | null;
/** Disposes a model's geometries and materials (and removes it from its parent). */
export declare function disposeTree(object: THREE.Object3D): void;
