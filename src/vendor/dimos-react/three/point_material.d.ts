import * as THREE from "three";
/** What glow splats fade into: the page behind the canvas (Viewer.setTheme keeps it on --scene-bg). */
export declare const splatBackground: THREE.Color;
/** The point styles; each is a shader path selected by `uStyle` (plus a define when its shading differs). */
export declare const POINT_STYLES: {
    voxel: {
        id: number;
        label: string;
        define: string;
        about: string;
    };
    splat: {
        id: number;
        label: string;
        define: string;
        about: string;
    };
    disc: {
        id: number;
        label: string;
        define: null;
        about: string;
    };
    square: {
        id: number;
        label: string;
        define: null;
        about: string;
    };
};
/** How a cube's faces are lit. */
export declare const CUBE_SHADES: {
    soft: {
        id: number;
        label: string;
        about: string;
    };
    sky: {
        id: number;
        label: string;
        about: string;
    };
    outline: {
        id: number;
        label: string;
        about: string;
    };
    bevel: {
        id: number;
        label: string;
        about: string;
    };
    memworld: {
        id: number;
        label: string;
        about: string;
    };
};
export type PointStyle = keyof typeof POINT_STYLES;
export type CubeShade = keyof typeof CUBE_SHADES;
export type ColorMode = "height" | "intensity" | "range" | "solid";
export interface PointLook {
    style?: PointStyle;
    size?: number;
    colorMode?: ColorMode;
    gradient?: string;
    period?: number;
    axis?: 0 | 1 | 2;
    rangeMin?: number | null;
    rangeMax?: number | null;
    solid?: string;
    opacity?: number;
    cubeShade?: CubeShade;
}
/** The look a point layer starts from; props override any field. */
export declare const DEFAULT_LOOK: Required<Omit<PointLook, "period">>;
/** The camera's distance to what it orbits; the viewer keeps it current (splat fog is scaled by it). */
export declare const focusDistance: {
    value: number;
};
/**
 * @param pixelsPerMeter the viewer's (Viewer.pixelsPerMeter), shared so sprites size in meters
 */
export declare function makePointMaterial(pixelsPerMeter: {
    value: number;
}): THREE.ShaderMaterial;
/**
 * Pushes a look into the material's uniforms; `range` is the resolved [min, max] when the look's is auto.
 */
export declare function applyLook(material: THREE.ShaderMaterial, partial: PointLook, range: [number, number]): void;
/**
 * Draws only the points inside an axis-aligned box of the scene (world) frame; `null` bounds (or no call) = no limit
 * on that side. `min` / `max` are [x, y, z] with nulls allowed.
 */
export declare function setClipBox(material: THREE.ShaderMaterial, min?: (number | null)[] | null, max?: (number | null)[] | null): void;
