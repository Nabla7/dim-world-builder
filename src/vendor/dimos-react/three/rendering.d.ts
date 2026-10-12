import { Store } from './store.ts';
import { CubeShade, PointLook, PointStyle } from './point_material.ts';
import { EditablePointLook } from './look_editor.tsx';
export interface RenderingDefaults {
    pointStyle: PointStyle;
    cubeShade: CubeShade;
}
/** The page-wide defaults (saved per viewer). A layer whose look says style "default" follows `pointStyle`. */
export declare const rendering: Store<RenderingDefaults>;
/** Set while splats are drawn as cubes because frames took longer than FRAME_BUDGET_MS for 3 s (the Viewer sets it). */
export declare const splatFallback: Store<{
    active: boolean;
    frameMs: number;
}>;
export declare const FRAME_BUDGET_MS = 16;
/**
 * The style a layer draws with: its own, else the page default, with the fallback applied. A name that isn't a
 * POINT_STYLES key passes through (applyLook draws it as "disc").
 */
export declare function resolveStyle(style?: string | null): PointStyle;
/** A look with "default" style and the page's cube shading resolved, ready for applyLook. */
export declare function resolveLook(look: EditablePointLook): PointLook;
