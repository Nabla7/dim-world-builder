import { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
/** A Tabs / Segmented choice. */
export interface ChoiceItem<T extends string | number = string> {
    value: T;
    label?: ReactNode;
    icon?: string;
    badge?: ReactNode;
    disabled?: boolean;
    title?: string;
    /** more attributes for this item's button, e.g. data-* */
    props?: ButtonHTMLAttributes<HTMLButtonElement> & {
        [data: `data-${string}`]: string | number | boolean | undefined;
    };
}
/**
 * A choice as given: a string (value and label), a [value, label] pair, or a ChoiceItem. A pair built by `.map()` types
 * as an array rather than a tuple, so any array is taken (its first item is the value).
 */
export type ChoiceInput<T extends string | number> = (T & string) | readonly [T, ReactNode?] | readonly NoInfer<T | ReactNode>[] | ChoiceItem<T>;
export interface TabsProps<T extends string | number = string> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    items: readonly ChoiceInput<T>[];
    /** null: none selected (e.g. tabs that open a panel, all closed) */
    value: T | null;
    onChange?: (value: T) => void;
    variant?: "line" | "pill";
    size?: "sm" | "md";
    /** stacks them (↑/↓ move) */
    vertical?: boolean;
    /** the tab list's accessible name */
    label?: string;
}
/**
 * Tabs: `items` as [{ value, label, icon, badge, disabled, title, props }] or [[value, label]] (`props`: more
 * attributes for that item's button, e.g. data-*). `vertical` stacks them (↑/↓ move).
 */
export declare function Tabs<T extends string | number = string>({ variant, ...props }: TabsProps<T>): import('react').JSX.Element;
/** A compact segmented control (same API as Tabs). */
export declare function Segmented<T extends string | number = string>(props: TabsProps<T>): import('react').JSX.Element;
type Side = "top" | "bottom" | "left" | "right";
/** A side of the anchor, optionally aligned to its start or end (default: centered). */
export type Placement = Side | `${Side}-${"start" | "center" | "end"}`;
/** The anchor's box (a DOMRect, or a point as a zero-size rect). */
export type AnchorRect = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;
/** Where to put a `floating` box of size (w, h) next to an anchor rect, kept on screen. */
export declare function placeFloating(anchor: AnchorRect, size: {
    width: number;
    height: number;
}, placement?: Placement, gap?: number): {
    x: number;
    y: number;
    side: string;
};
/** What a Popover / Menu gives its trigger (spread them onto the element that opens it). */
export interface TriggerProps {
    ref: (element: HTMLElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog" | "menu";
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}
/** An element (gets onClick + ref), `(props) => element`, or other content (wrapped in a span / button). */
export type Trigger = ReactNode | ((props: TriggerProps & {
    open: boolean;
}) => ReactNode);
export interface PopoverProps {
    /** an element (gets onClick + ref) or `(props) => element` */
    trigger: Trigger;
    /** content, or `({ close }) => content` */
    children: ReactNode | ((api: {
        close: () => void;
    }) => ReactNode);
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
    placement?: Placement;
    className?: string;
    style?: CSSProperties;
}
/** A popover anchored to its trigger. `trigger`: an element (gets onClick + ref) or `(props) => element`. */
export declare function Popover({ trigger, children, open, onOpenChange, defaultOpen, placement, className, style, }: PopoverProps): import('react').JSX.Element;
/** A menu entry that does something. Its `data-*` / `aria-*` keys (and `id`) go on its button. */
export interface MenuAction {
    label: ReactNode;
    icon?: string;
    onSelect?: () => void;
    danger?: boolean;
    disabled?: boolean;
    /** makes it a checkbox item (a check when true) */
    checked?: boolean;
    shortcut?: ReactNode;
    title?: string;
    /** stays open after a pick */
    keepOpen?: boolean;
    key?: Key;
    id?: string;
    separator?: false;
    heading?: undefined;
    [dataOrAria: `data-${string}` | `aria-${string}`]: string | number | boolean | undefined;
}
/** A line between groups of items ("-" does the same). */
export interface MenuSeparator {
    separator: true;
    heading?: undefined;
}
/** A group's title (not clickable). */
export interface MenuHeading {
    heading: ReactNode;
    separator?: false;
}
export type MenuItem = MenuAction | MenuSeparator | MenuHeading | "-";
export interface MenuListProps {
    items: readonly MenuItem[];
    onClose?: () => void;
    autoFocus?: boolean;
}
/**
 * A menu's items in place (inside a Popover, a panel): what Menu and MenuAt show. `items` as for Menu; `onClose` after
 * a pick (unless the item `keepOpen`s).
 */
export declare function MenuList({ items, onClose, autoFocus }: MenuListProps): import('react').JSX.Element;
export interface MenuProps {
    items: readonly MenuItem[];
    /** an element (gets onClick + ref), `(props) => element`, or a button's content (default: a ⋯ icon) */
    trigger?: Trigger;
    placement?: Placement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
}
/** A dropdown menu. An item's `data-*` / `aria-*` keys (and `id`) go on its button, like other components' DOM props. */
export declare function Menu({ items, trigger, placement, open, onOpenChange, className }: MenuProps): import('react').JSX.Element;
export interface ContextMenuProps extends HTMLAttributes<HTMLDivElement> {
    /** the items, or `(event) => items` for where it was opened (none: no menu) */
    items: readonly MenuItem[] | ((event: ReactMouseEvent<HTMLDivElement>) => readonly MenuItem[] | null | undefined);
    disabled?: boolean;
}
/** Right-click (or long-press on touch) opens a menu at the pointer. */
export declare function ContextMenu({ items, children, disabled, className, ...rest }: ContextMenuProps): import('react').JSX.Element;
export interface MenuAtProps extends HTMLAttributes<HTMLDivElement> {
    x: number;
    y: number;
    items?: readonly MenuItem[];
    onClose: () => void;
}
/**
 * A menu open at a screen point, for triggers ContextMenu can't tell apart (a 3D view's right click that isn't a
 * right-drag pan, say). `children` go above the items (a heading line, or an inline form instead of `items`).
 */
export declare function MenuAt({ x, y, items, onClose, children, className, ...rest }: MenuAtProps): import('react').JSX.Element;
export interface TooltipProps {
    content: ReactNode;
    /** an element (gets the hover / focus handlers and a ref), or content to wrap in a span */
    children: ReactNode;
    /** ms */
    delay?: number;
    placement?: Placement;
    disabled?: boolean;
}
/** A hover / focus tooltip. */
export declare function Tooltip({ content, children, delay, placement, disabled }: TooltipProps): import('react').JSX.Element;
export interface SidebarSection {
    title?: ReactNode;
    content: ReactNode;
    key?: Key;
}
export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    title?: ReactNode;
    sections?: SidebarSection[];
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    side?: "left" | "right";
    width?: number | string;
    footer?: ReactNode;
}
/** A collapsible side panel with titled sections. */
export declare function Sidebar({ title, sections, children, collapsed, onCollapsedChange, side, width, footer, className, style, ...rest }: SidebarProps): import('react').JSX.Element;
export interface NavRailItem<T extends Key = string> {
    value: T;
    icon: string;
    label: string;
    badge?: ReactNode;
    disabled?: boolean;
}
export interface NavRailProps<T extends Key = string> extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    items: NavRailItem<T>[];
    value: T;
    onChange?: (value: T) => void;
    showLabels?: boolean;
    footer?: ReactNode;
}
/** A vertical icon rail (Desktop's left rail, the Controller's panel switcher). */
export declare function NavRail<T extends Key = string>({ items, value, onChange, showLabels, footer, className, ...rest }: NavRailProps<T>): import('react').JSX.Element;
export type StepState = "done" | "current" | "todo" | "failed";
export interface Step {
    label: ReactNode;
    description?: ReactNode;
    /** wins over `current` (a process that reports each step, one of which may have failed) */
    state?: StepState;
    key?: Key;
}
export interface StepperProps extends HTMLAttributes<HTMLOListElement> {
    steps: Step[];
    /** the current step's index */
    current?: number;
    /** lets the user go back to a finished step */
    onStep?: (index: number) => void;
    vertical?: boolean;
}
/**
 * Wizard steps, or a process's progress (a launch, an install). `onStep`: lets the user go back to a finished step. A
 * step's own `state` wins over `current` (a process that reports each step, one of which may have failed).
 */
export declare function Stepper({ steps, current, onStep, vertical, className, ...rest }: StepperProps): import('react').JSX.Element;
export interface Crumb {
    label: ReactNode;
    onClick?: () => void;
    href?: string;
}
export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
    /** the last one is the current page */
    items: Crumb[];
}
/** Where you are: links back up a path, then the current page. */
export declare function Breadcrumbs({ items, className, ...rest }: BreadcrumbsProps): import('react').JSX.Element;
/** Fuzzy score of `query` in `text` (higher = better; -1 = no match). */
export declare function fuzzyScore(query: string, text: unknown): number;
export interface Command {
    id: string;
    label: string;
    group?: string;
    shortcut?: string;
    icon?: string;
    /** more words to match */
    keywords?: string;
    run: () => void;
}
export interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    commands: Command[];
    placeholder?: string;
}
/** ⌘K-style command list. */
export declare function CommandPalette({ open, onClose, commands, placeholder }: CommandPaletteProps): import('react').JSX.Element | null;
/**
 * `const palette = useCommandPalette()` → `{ open, setOpen, toggle }`, opened with mod+k (⌘K / Ctrl+K).
 * Render `<CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />`.
 */
export declare function useCommandPalette(hotkey?: string): {
    open: boolean;
    setOpen: import('react').Dispatch<import('react').SetStateAction<boolean>>;
    toggle: () => void;
};
export {};
