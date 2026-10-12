import { SKINS } from './tokens.ts';
export { SKINS };
export declare const SKIN_KEY = "portal.theme";
export declare const CORNERS_KEY = "portal.corners";
export declare const DESKTOP_THEME_URL = "/theme.css";
/** Corners: "sharp", "rounded", or "theme" (the skin's own). */
export type Corners = "sharp" | "rounded" | "theme";
/** The theme's palette (themeColors()): CSS color strings, plus the mono / sans font stacks. */
export interface ThemeColors {
    bg: string;
    surface: string;
    raised: string;
    card: string;
    fg: string;
    mutedFg: string;
    border: string;
    primary: string;
    primaryFg: string;
    ok: string;
    warn: string;
    danger: string;
    info: string;
    sceneBg: string;
    sceneGrid: string;
    sceneGridMajor: string;
    /** a floor plan's floor, wall and wall-edge colors (optional tokens: "" when a skin leaves them out) */
    sceneFloor: string;
    sceneWall: string;
    sceneWallRim: string;
    axisX: string;
    axisY: string;
    axisZ: string;
    /** the four categorical colors */
    cat: string[];
    mono: string;
    sans: string;
}
/** What applyTheme put in effect. */
export interface AppliedTheme {
    skin: string;
    corners: Corners;
    dark: boolean;
    square: boolean;
}
/** Whether this page is one of Desktop's apps (served at /apps/<name>/, so Desktop's /theme.css is there). */
export declare function onDesktop(): boolean;
/** Desktop's saved skin id ("portal", "research", "vibeslop", …); "portal" when nothing is saved. */
export declare function desktopSkin(): string;
/** Desktop's corners setting: "sharp", "rounded", or "theme" (the skin's own). */
export declare function desktopCorners(): Corners;
/**
 * Puts the theme's stylesheets in the page: Desktop's /theme.css (on Desktop, or `themeUrl`), else the bundled
 * tokens; then the components' CSS. Both go first in <head> so the app's own CSS still wins ties.
 * @returns resolves when the tokens are in effect
 */
export declare function installThemeCss({ themeUrl, bundled, }?: {
    themeUrl?: string | null;
    bundled?: boolean;
}): Promise<void>;
/**
 * Sets html[data-skin], html[data-corners] (Desktop's /theme.css keys off both) and html[data-dr-dark] (the
 * components' dark structural rules), and returns what is in effect.
 */
export declare function applyTheme({ skin, corners, }?: {
    skin?: string;
    corners?: Corners;
}): AppliedTheme;
/** Calls `listener()` whenever Desktop saves a new skin or corners (in its own page or another tab). Returns unsubscribe. */
export declare function watchDesktopTheme(listener: () => void): () => void;
/** The current palette, for canvases, charts and 3D scenes (read from the theme's variables). */
export declare function themeColors(): Partial<ThemeColors>;
export declare function signalReady(): void;
/**
 * Keeps `--dim-inset-top/bottom/left/right` on :root current: how much of the page Desktop's shell covers (its dock),
 * from the shell's `{type: "dimos-inset"}` messages; 0 outside Desktop.
 */
export declare function installInsets(): void;
