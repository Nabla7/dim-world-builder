/** A ramp stop: [position 0..1, "#rrggbb"]. */
export type RampStop = [position: number, hex: string];
/** An rgb color, each channel 0..255. */
export type Rgb = [r: number, g: number, b: number];
/** A repeating palette: its menu label and its colors. */
export interface Palette {
    label: string;
    colors: string[];
}
/** Stops as [position 0..1, "#rrggbb"]; piecewise-linear in sRGB. */
export declare const RAMPS: Record<string, RampStop[]>;
export declare const GRADIENTS: string[];
export declare const DEFAULT_GRADIENT = "memworld";
/** Soft neon palettes (bright enough to glow on a dark scene); linear in sRGB between evenly spaced stops. */
export declare const PALETTES: Record<string, Palette>;
export declare const PALETTE_NAMES: string[];
export declare const DEFAULT_PALETTE = "aurora";
/** meters of height one full up-and-back cycle spans */
export declare const DEFAULT_PERIOD = 9;
/** True for a repeating palette's name (PALETTES), false for a ramp (RAMPS). */
export declare function isPalette(name: string): boolean;
/** Where in its cycle a height is, 0 (inclusive) to 1 (exclusive); negative heights wrap the same way. */
export declare function cyclePhase(height: number, period?: number): number;
/** A palette's color at a phase (0..1, wrapping) as 0..255 rgb: first color at 0, last at 0.5, first again at 1. */
export declare function paletteAt(name: string, phase: number): Rgb;
/** A palette's color for a height. */
export declare function heightColor(name: string, height: number, period?: number): Rgb;
/** The palette for another cloud beside one drawn in `taken`: the next one, so the two never match. */
export declare function otherPalette(taken: string): string;
/** The ramp's color at t (0..1) as 0..255 rgb (a palette's: at phase t). */
export declare function sampleGradient(name: string, t: number): Rgb;
