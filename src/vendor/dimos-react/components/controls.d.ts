import { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, Key, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
export type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "ok" | "warn";
export type ControlSize = "sm" | "md" | "lg";
/** The status colors a Badge, Chip or TagList item takes. */
export type BadgeTone = "default" | "info" | "ok" | "warn" | "danger";
export type DotTone = "ok" | "warn" | "danger" | "info" | "off";
/** The element a Button renders: a <button>, or an <a> when it has an `href`. */
export type ButtonElement = HTMLButtonElement | HTMLAnchorElement;
export interface ButtonProps extends Omit<ButtonHTMLAttributes<ButtonElement>, "type">, Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "download" | "target" | "rel" | "hrefLang" | "referrerPolicy"> {
    variant?: ButtonVariant;
    size?: ControlSize;
    icon?: string;
    iconRight?: string;
    pressed?: boolean;
    loading?: boolean;
    block?: boolean;
    type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
    /** makes it a link that looks like a button (`download`, `target` pass through) */
    href?: string;
    /** the rendered element (React 19 passes a function component's ref as a prop) */
    ref?: Ref<ButtonElement>;
}
/** A button; `href` makes it a link that looks like a button (`download`, `target` pass through). */
export declare function Button({ variant, size, icon, iconRight, pressed, loading, block, className, children, type, disabled, href, ref, ...rest }: ButtonProps): import('react').JSX.Element;
export interface HoldButtonProps extends ButtonProps {
    onHold?: () => void;
    onRelease?: () => void;
}
/**
 * A button that acts while held (jog controls): `onHold()` on press, `onRelease()` on release, cancel or a lost
 * capture, so a missed pointerup still stops. Takes Button's props.
 */
export declare function HoldButton({ onHold, onRelease, disabled, className, ...rest }: HoldButtonProps): import('react').JSX.Element;
export interface IconButtonProps extends Omit<ButtonProps, "icon"> {
    icon: string;
    /** its accessible name and tooltip */
    label?: string;
    round?: boolean;
}
/** A square icon-only button; `label` is its accessible name and tooltip. */
export declare function IconButton({ icon, label, size, variant, round, className, ...rest }: IconButtonProps): import('react').JSX.Element;
/** Buttons side by side, joined into one control. */
export declare function ButtonGroup({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>): import('react').JSX.Element;
export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    inline?: boolean;
    /** the id of the control the label names */
    htmlFor?: string;
}
/** A label + control + hint/error, stacked (or `inline`: label left, control right). */
export declare function Field({ label, hint, error, inline, htmlFor, className, children, ...rest }: FieldProps): import('react').JSX.Element;
export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> {
    value?: string | null;
    /** the text, on every keystroke */
    onChange?: (text: string) => void;
    onEnter?: (text: string) => void;
    /** alone (no onChange): the text once, on Enter or blur, when it differs from `value` */
    onCommit?: (text: string) => void;
    size?: "sm" | "md";
    mono?: boolean;
    icon?: string;
    invalid?: boolean;
}
/**
 * Single-line text. `onChange(text)` on every keystroke; `onEnter(text)` on Enter. Or `onCommit(text)` alone: the box
 * keeps what's typed and reports it once, on Enter or blur, when it differs from `value` (renames, labels); Escape
 * puts `value` back.
 */
export declare function TextInput({ value, onChange, onEnter, onCommit, onKeyDown, onBlur, size, mono, icon, className, style, invalid, ...rest }: TextInputProps): import('react').JSX.Element;
export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
    value?: string | null;
    onChange?: (text: string) => void;
}
/** A search box: a magnifier, and a clear button once there is text. */
export declare function SearchInput({ value, onChange, placeholder, className, style, ...rest }: SearchInputProps): import('react').JSX.Element;
export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
    value?: string | null;
    onChange?: (text: string) => void;
    mono?: boolean;
}
/** Multi-line text. */
export declare function TextArea({ value, onChange, mono, rows, className, ...rest }: TextAreaProps): import('react').JSX.Element;
interface NumberInputBaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step" | "size"> {
    value?: number | null;
    min?: number;
    max?: number;
    step?: number;
    unit?: ReactNode;
    size?: "sm" | "md";
    /** digits after the point shown */
    precision?: number;
}
/** `onChange` gets the committed number; with `nullable`, null once the box is cleared. */
export type NumberInputProps = NumberInputBaseProps & ({
    nullable?: false;
    onChange?: (value: number) => void;
} | {
    nullable: boolean;
    onChange?: (value: number | null) => void;
});
/**
 * A number box that only reports finite numbers: typing keeps the text, Enter/blur commits; ↑/↓ step (shift: ×10).
 * `unit` shows after the number. `nullable`: clearing the box reports null (e.g. "auto"; pair with a placeholder).
 */
export declare function NumberInput(props: NumberInputProps): import('react').JSX.Element;
/** One choice of a Select / RadioGroup, normalized. */
export interface SelectOption<T> {
    value: T;
    label?: ReactNode;
    disabled?: boolean;
    /** Select puts options with the same group under one <optgroup> */
    group?: string;
}
/**
 * An option as given: the value itself, a [value, label] pair, or a SelectOption. A pair built by `.map()` types as an
 * array rather than a tuple, so any array is taken (its first item is the value).
 */
export type OptionInput<T> = T | readonly [T, ReactNode?] | readonly NoInfer<T | ReactNode>[] | SelectOption<T>;
/** Normalizes options: ["a", "b"], [["a", "Label A"]], or [{ value, label, disabled }]. */
export declare function normalizeOptions<T>(options?: readonly OptionInput<T>[]): SelectOption<T>[];
export interface SelectProps<T = string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "size"> {
    value?: T;
    onChange?: (value: T) => void;
    options?: readonly OptionInput<T>[];
    /** shown while `value` matches no option (default "Choose…") */
    placeholder?: string;
    size?: "sm" | "md";
}
/**
 * A native select (keyboard, mobile pickers and screen readers for free), themed. `options`: strings,
 * [value, label] pairs or { value, label, disabled, group }. `onChange` gets the option's value (its original type).
 */
export declare function Select<T>({ value, onChange, options, placeholder, size, className, ...rest }: SelectProps<T>): import('react').JSX.Element;
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
    value?: boolean;
    onChange?: (checked: boolean) => void;
    label?: ReactNode;
    indeterminate?: boolean;
}
/** A checkbox with its label (`label` or `children`). `indeterminate` shows a dash. */
export declare function Checkbox({ value, onChange, label, indeterminate, disabled, className, children, ...rest }: CheckboxProps): import('react').JSX.Element;
export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> {
    value?: boolean;
    onChange?: (on: boolean) => void;
    label?: ReactNode;
    size?: "sm" | "md";
}
/** An on/off switch (role="switch"). */
export declare function Toggle({ value, onChange, label, size, disabled, className, ...rest }: ToggleProps): import('react').JSX.Element;
export declare const Switch: typeof Toggle;
export interface RadioProps<T> extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
    /** reported by onChange when this radio is picked */
    value: T;
    onChange?: (value: T) => void;
    label?: ReactNode;
}
/** One radio button (use RadioGroup for a set). */
export declare function Radio<T>({ checked, onChange, label, name, value, disabled, className, ...rest }: RadioProps<T>): import('react').JSX.Element;
export interface RadioGroupProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    value?: T;
    onChange?: (value: T) => void;
    options?: readonly OptionInput<T>[];
    /** the radios' shared name (default: a generated one) */
    name?: string;
    direction?: "column" | "row";
}
/** A set of radios: `options` as for Select; `direction` "column" | "row". */
export declare function RadioGroup<T>({ value, onChange, options, name, direction, className, ...rest }: RadioGroupProps<T>): import('react').JSX.Element;
export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step"> {
    value?: number;
    onChange?: (value: number) => void;
    /** once the drag (or key press) ends */
    onCommit?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** the readout's text */
    format?: (value: number) => ReactNode;
    showValue?: boolean;
}
/** A range slider with its value shown. `format(value)` for the readout; `onCommit(value)` once the drag ends. */
export declare function Slider({ value, onChange, onCommit, min, max, step, format, showValue, className, disabled, ...rest }: SliderProps): import('react').JSX.Element;
export interface RangeSliderProps {
    value?: [number, number];
    onChange?: (value: [number, number]) => void;
    min?: number;
    max?: number;
    step?: number;
    /** each end's readout text */
    format?: (value: number) => ReactNode;
    showValue?: boolean;
    className?: string;
    disabled?: boolean;
}
/** Two thumbs on one track: `value` = [low, high]. */
export declare function RangeSlider({ value, onChange, min, max, step, format, showValue, className, disabled, }: RangeSliderProps): import('react').JSX.Element;
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
    solid?: boolean;
    dot?: boolean;
}
/** A small status label. `tone`: "default" | "info" | "ok" | "warn" | "danger"; `solid` fills it; `dot` adds a dot. */
export declare function Badge({ tone, solid, dot, className, children, ...rest }: BadgeProps): import('react').JSX.Element;
export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onChange"> {
    selected?: boolean;
    onChange?: (selected: boolean) => void;
    onRemove?: () => void;
    icon?: string;
    tone?: BadgeTone;
}
/** A toggleable chip (filters, multi-select). `selected` + `onChange(selected)`; `onRemove` adds an ✕. */
export declare function Chip({ selected, onChange, onRemove, icon, tone, className, children, ...rest }: ChipProps): import('react').JSX.Element;
export interface Tag {
    label: ReactNode;
    tone?: BadgeTone;
    title?: string;
    key?: Key;
}
export interface TagListProps extends HTMLAttributes<HTMLSpanElement> {
    items: (string | Tag)[];
    oneLine?: boolean;
    extra?: ReactNode;
}
/**
 * A row of read-only tags (a blueprint's modules, a message's topics). `items`: strings or { label, tone, title, key }.
 * `oneLine` keeps them on one line: as many as fit, then a "+N" tag whose title lists the rest. `extra` goes after them
 * (always shown).
 */
export declare function TagList({ items, oneLine, extra, className, ...rest }: TagListProps): import('react').JSX.Element;
export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: DotTone;
    pulse?: boolean;
    /** its accessible name and tooltip (unlabeled dots are decorative) */
    label?: string;
}
/** A status dot: tone "ok" | "warn" | "danger" | "info" | "off"; `pulse` animates it. */
export declare function StatusDot({ tone, pulse, label, className, ...rest }: StatusDotProps): import('react').JSX.Element;
/** A data source's link state (see useConnectionState()); "offline" too. */
export type ConnectionState = "connecting" | "connected" | "degraded" | "lost" | "offline";
export interface ConnectionStatusProps extends HTMLAttributes<HTMLSpanElement> {
    /** a ConnectionState; other strings show as "off" */
    state?: ConnectionState | (string & {});
    /** replaces the state's name */
    label?: ReactNode;
    detail?: ReactNode;
}
/**
 * A link indicator: dot + state (+ an optional detail like "12 ms"). `state` is a data source state ("connecting" |
 * "connected" | "degraded" | "lost"); see useConnectionState().
 */
export declare function ConnectionStatus({ state, label, detail, className, ...rest }: ConnectionStatusProps): import('react').JSX.Element;
export interface KbdProps extends HTMLAttributes<HTMLElement> {
    /** "mod" (⌘ / Ctrl), "shift", "alt" or a key's label */
    keys?: string[];
}
/** A keyboard key: <Kbd>W</Kbd>, or `keys={["mod", "K"]}`. */
export declare function Kbd({ keys, className, children, ...rest }: KbdProps): import('react').JSX.Element;
export interface FabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: string;
    /** its tooltip and accessible name */
    label?: string;
    tone?: "primary" | "info" | "ok" | "warn" | "danger";
    /** filled: its panel is open */
    active?: boolean;
    attention?: "pulse" | "glow" | "spin";
    /** diameter, px */
    size?: number;
}
/**
 * A round floating action button over a view (the main actions of a canvas app). `tone` colors its ring ("primary" |
 * "info" | "ok" | "warn" | "danger"); `active` fills it (its panel is open); `attention` draws the eye: "pulse" (the
 * next step), "glow" (recommended), "spin" (working). `label` is its tooltip and accessible name.
 */
export declare function Fab({ icon, label, tone, active, attention, size, className, style, ...rest }: FabProps): import('react').JSX.Element;
export interface AngleDialProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    /** radians, counter-clockwise positive */
    value?: number;
    /** radians, wrapped to -π..π while dragging */
    onChange?: (radians: number) => void;
    /** diameter, px */
    size?: number;
    tone?: "primary" | "info" | "ok" | "warn" | "danger";
    disabled?: boolean;
}
/**
 * An angle dial: drag around it to turn. `value` in radians, counter-clockwise positive (a map's yaw); the hand is
 * drawn for a screen whose y points down. `onChange(radians)` wraps to -π..π; arrow keys step 1° (shift: 10°).
 */
export declare function AngleDial({ value, onChange, size, tone, disabled, className, style, ...rest }: AngleDialProps): import('react').JSX.Element;
export interface CopyButtonProps extends ButtonProps {
    text: string;
    /** its tooltip */
    label?: string;
}
/** Copies `text` to the clipboard, then says "Copied" for a moment. `label` is its tooltip; children replace "Copy". */
export declare function CopyButton({ text, label, size, children, ...rest }: CopyButtonProps): import('react').JSX.Element;
export {};
