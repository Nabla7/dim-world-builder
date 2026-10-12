import { ReactNode } from 'react';
import { Corners, ThemeColors } from './theme.ts';
/** What useTheme() gives: the skin and corners in effect, what they look like, and per-page setters. */
export interface ThemeContextValue {
    skin: string;
    corners: Corners;
    dark: boolean;
    square: boolean;
    colors: Partial<ThemeColors>;
    /** the theme's stylesheet has been applied (absent outside a DimThemeProvider) */
    ready?: boolean;
    /** this page only; undefined goes back to Desktop's */
    setSkin: (next: string | undefined) => void;
    setCorners: (next: Corners | undefined) => void;
}
export interface DimThemeProviderProps {
    /** pin the skin (default: Desktop's saved choice, followed live) */
    skin?: string;
    /** pin the corners (default: Desktop's saved choice, followed live) */
    corners?: Corners;
    /** Desktop's tokens stylesheet (default /theme.css on Desktop, the bundled copy elsewhere) */
    themeUrl?: string;
    bundled?: boolean;
    /** style <body> too (default true) */
    global?: boolean;
    children?: ReactNode;
}
/**
 * `skin` / `corners`: pin them (default: Desktop's saved choice, followed live). `themeUrl`: Desktop's tokens
 * stylesheet (default /theme.css on Desktop, the bundled copy elsewhere). `global`: style <body> too (default true).
 */
export declare function DimThemeProvider({ skin, corners, themeUrl, bundled, global, children }: DimThemeProviderProps): import('react').JSX.Element;
/** `{ skin, corners, dark, square, colors, ready, setSkin, setCorners }` (setSkin/setCorners: this page only). */
export declare function useTheme(): ThemeContextValue;
/** The theme's colors (themeColors()), re-read on every skin change: for canvases, charts and 3D scenes. */
export declare function useThemeColors(): Partial<ThemeColors>;
