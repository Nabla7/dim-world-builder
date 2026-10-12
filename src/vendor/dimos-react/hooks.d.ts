import { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
/** useState that survives reloads (localStorage, JSON). A blocked or full storage just keeps it in memory. */
export declare function usePersistentState<T>(key: string, initial: T | (() => T)): [T, (next: T | ((old: T) => T)) => void];
/** The parts of a keyboard event (DOM or React) a hotkey looks at. */
export type HotkeyEvent = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;
/** "mod+k" → does `event` match it (mod = ⌘ on Mac, Ctrl elsewhere)? */
export declare function matchesHotkey(event: HotkeyEvent, combo: string): boolean;
/**
 * Keyboard shortcuts: `{ "mod+k": openPalette, "?": showHelp }`. Ignored while typing in a field unless the combo has
 * a modifier. `enabled: false` turns them all off.
 */
export declare function useHotkeys(bindings: Record<string, (event: KeyboardEvent) => void>, { enabled, target }?: {
    enabled?: boolean;
    target?: EventTarget;
}): void;
/**
 * The set of keys held right now (KeyboardEvent.code, e.g. "KeyW", "ArrowUp"), for driving and jogging. Cleared when
 * the window loses focus so a key never sticks. Only `codes` are tracked (default: all).
 */
export declare function useHeldKeys({ codes, enabled }?: {
    codes?: string[];
    enabled?: boolean;
}): Set<string>;
export declare function useEscape(handler: (event: KeyboardEvent) => void, enabled?: boolean): void;
/** Whether a CSS media query matches, live. */
export declare function useMediaQuery(query: string): boolean;
/** A phone-sized or touch-first viewport (narrow, or a coarse pointer with no hover). */
export declare function useMobile(maxWidth?: number): boolean;
/** Where a drag is: pointer position, offset since the start, the event and the handle element. */
export interface DragInfo {
    x: number;
    y: number;
    dx: number;
    dy: number;
    event: PointerEvent | ReactPointerEvent<HTMLElement>;
    element: HTMLElement;
}
export interface DragHandlers {
    onStart?: (info: DragInfo) => void;
    onMove?: (info: DragInfo) => void;
    onEnd?: (info: DragInfo) => void;
    disabled?: boolean;
}
/** The props useDrag returns, to spread on the handle element. */
export interface DragProps {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    style: CSSProperties;
}
/**
 * Pointer drags (mouse, pen, touch) on an element: `onStart(point)`, `onMove({ dx, dy, x, y, event })` with dx/dy
 * since the start, `onEnd(...)`. Returns props to spread on the handle element.
 */
export declare function useDrag(handlers: DragHandlers): DragProps;
/** `Date.now()`, re-rendered every `intervalMs` (for "3 s ago" labels and staleness). */
export declare function useNow(intervalMs?: number): number;
/** A gamepad's state (useGamepad). */
export interface GamepadState {
    id: string;
    axes: number[];
    buttons: boolean[];
}
/**
 * The first connected gamepad, polled each animation frame: `{ id, axes, buttons: boolean[] } | null`.
 * `deadzone` zeroes small stick values.
 */
export declare function useGamepad({ deadzone, enabled, }?: {
    deadzone?: number;
    enabled?: boolean;
}): GamepadState | null;
/** The latest value of `value` in a ref (for callbacks that must not re-subscribe). */
export declare function useLatest<T>(value: T): MutableRefObject<T>;
/**
 * Copies text to the clipboard → true when it worked. Pages served over plain http (a robot reached by IP) have no
 * navigator.clipboard (secure contexts only), so it falls back to a hidden textarea + execCommand("copy").
 */
export declare function copyText(text: string): Promise<boolean>;
