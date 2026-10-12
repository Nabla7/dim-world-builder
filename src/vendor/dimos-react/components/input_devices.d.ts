import { CSSProperties, HTMLAttributes, ReactNode, SVGAttributes } from 'react';
import { StickValue } from './thumbstick.tsx';
/** Pointer offset from a circle's center → stick value in -1..1 (y up), clamped to the unit circle. */
export declare function stickValue(dx: number, dy: number, radius: number): StickValue;
export interface JoystickProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    onChange?: (value: StickValue) => void;
    onStart?: () => void;
    onEnd?: () => void;
    size?: number;
    disabled?: boolean;
    label?: ReactNode;
    className?: string;
    style?: CSSProperties;
}
/** A virtual joystick: `onChange({ x, y })` (-1..1, y up) on every move while held, `{0, 0}` on release. */
export declare function Joystick({ onChange, onStart, onEnd, size, disabled, label, className, style, ...rest }: JoystickProps): import('react').JSX.Element;
export interface StickIndicatorProps extends SVGAttributes<SVGSVGElement> {
    value: StickValue | null;
    size?: number;
    label?: string;
    className?: string;
}
/**
 * A small read-only stick: a ring with a dot where a stick is (x, y in -1..1, y up), e.g. a gamepad's or a policy's
 * sticks. `value` null shows it idle.
 */
export declare function StickIndicator({ value, size, label, className, ...rest }: StickIndicatorProps): import('react').JSX.Element;
export type DPadDirection = "up" | "down" | "left" | "right" | "center";
export interface DPadProps extends HTMLAttributes<HTMLDivElement> {
    onPress?: (dir: DPadDirection) => void;
    onRelease?: (dir: DPadDirection) => void;
    size?: number;
    /** content of the middle button (omit for none) */
    center?: ReactNode;
    disabled?: boolean;
    /** directions to show as pressed (e.g. from keys) */
    held?: string[];
    className?: string;
    style?: CSSProperties;
}
/**
 * A D-pad: `onPress(dir)` when a direction goes down, `onRelease(dir)` when it comes up ("up" | "down" | "left" |
 * "right" | "center"). Holds while the pointer is down.
 */
export declare function DPad({ onPress, onRelease, size, center, disabled, held, className, style, ...rest }: DPadProps): import('react').JSX.Element;
export interface FileDropProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    onFiles: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    title?: ReactNode;
    hint?: ReactNode;
    icon?: string;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
}
/** A drop zone that also opens the file picker on click. */
export declare function FileDrop({ onFiles, accept, multiple, disabled, title, hint, icon, children, className, style, ...rest }: FileDropProps): import('react').JSX.Element;
export interface ColorSwatchProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onChange"> {
    value: string;
    onChange?: (color: string) => void;
    presets?: string[];
    disabled?: boolean;
    label?: string;
    className?: string;
}
/** A color picker swatch (the color is user data: a layer's color, a path's color), with optional presets. */
export declare function ColorSwatch({ value, onChange, presets, disabled, label, className, ...rest }: ColorSwatchProps): import('react').JSX.Element;
export interface KeyHintsProps extends HTMLAttributes<HTMLDivElement> {
    /** [keys, label] pairs; keys is a list or a space-separated string */
    hints?: [string | string[], ReactNode][];
    vertical?: boolean;
    className?: string;
}
/** Key hints for a HUD: `[[["W", "A", "S", "D"], "drive"], [["Space"], "stop"]]` (a string key list works too: "W A S D"). */
export declare function KeyHints({ hints, vertical, className, ...rest }: KeyHintsProps): import('react').JSX.Element;
/** Keeps calling `onTick(value)` at `hz` while `value` is non-zero (a joystick held still still drives). */
export declare function useRepeatWhileHeld(value: StickValue | null | undefined, onTick: (value: StickValue) => void, hz?: number): void;
