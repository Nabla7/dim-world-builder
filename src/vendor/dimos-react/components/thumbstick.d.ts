import { CSSProperties, HTMLAttributes, ReactNode } from 'react';
/** below this share of the radius a resting thumb sends nothing */
export declare const STICK_DEAD_ZONE = 0.12;
/** >1 flattens the middle: small moves are finer, the edge is still full speed */
export declare const STICK_EXPO = 1.6;
/** how quickly a held stick's output follows the thumb (time constant, ms) */
export declare const STICK_SMOOTH_MS = 70;
/**
 * The thumb's offset from the stick's center (px, screen y down) → `{ x, y }` in -1..1 (up = +y). `axes` "xy" uses a
 * radial dead zone (no snapping to an axis); "x" / "y" look at that axis alone.
 */
export declare function shapeStick(dx: number, dy: number, radius: number, axes?: StickAxes): StickValue;
/**
 * One easing step: `current` toward `target` over `dtMs` (exponential, time constant `tauMs`). Snaps when close; a
 * target of exactly zero is returned as zero (releasing is never eased).
 */
export declare function smoothToward(current: number, target: number, dtMs: number, tauMs?: number): number;
export type StickAxes = "xy" | "x" | "y";
export interface StickValue {
    x: number;
    y: number;
}
/** A STOP button (or anything that must override a held thumb) calls this: every ThumbStick lets go until lifted. */
export declare function releaseAllThumbSticks(): void;
export interface ThumbStickProps extends HTMLAttributes<HTMLDivElement> {
    /** shaped -1..1 values (y up), eased while held, zero at once on release */
    onMove: (x: number, y: number) => void;
    axes?: StickAxes;
    label?: string;
    className?: string;
    style?: CSSProperties;
    /** replaces the built-in dead zone + expo */
    shape?: (dx: number, dy: number, radius: number, axes: StickAxes) => StickValue;
    /** replaces the built-in easing */
    smooth?: (current: number, target: number, dtMs: number) => number;
}
/** A thumb stick zone (size it with CSS: it fills its box; the ring's size is `--dr-stick`). */
export declare function ThumbStick({ onMove, axes, label, shape, smooth, className, style, ...rest }: ThumbStickProps): import('react').JSX.Element;
export interface KeyPadKey {
    label: ReactNode;
    down?: boolean;
    wide?: boolean;
    title?: string;
}
export interface KeyPadProps extends HTMLAttributes<HTMLDivElement> {
    /** null is a gap */
    rows?: (KeyPadKey | null)[][];
    className?: string;
}
/** Keyboard keys in rows, lit while held: `rows` = [[{ label: "Q", down: false }, null (a gap), …], …]. */
export declare function KeyPad({ rows, className, ...rest }: KeyPadProps): import('react').JSX.Element;
export interface KeyCapProps extends HTMLAttributes<HTMLSpanElement> {
    label: ReactNode;
    down?: boolean;
    empty?: boolean;
    wide?: boolean;
    title?: string;
    className?: string;
}
/** One key: `label`, `down` lights it; `empty` keeps its place invisible; `wide` for Space / Shift. */
export declare function KeyCap({ label, down, empty, wide, title, className, ...rest }: KeyCapProps): import('react').JSX.Element;
