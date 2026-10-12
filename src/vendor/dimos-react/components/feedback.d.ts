import { Component, CSSProperties, ErrorInfo, HTMLAttributes, ReactNode } from 'react';
export type AlertTone = "info" | "ok" | "warn" | "danger";
export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    tone?: AlertTone;
    title?: ReactNode;
    /** an Icon name (default: the tone's) */
    icon?: string;
    /** buttons */
    actions?: ReactNode;
    onClose?: () => void;
}
/**
 * An inline notice. `tone`: "info" | "ok" | "warn" | "danger"; `title`; `actions` (buttons); `onClose` adds an ✕.
 */
export declare function Alert({ tone, title, icon, actions, onClose, className, children, ...rest }: AlertProps): import('react').JSX.Element;
export type ToastId = string | number;
export interface ToastOptions {
    /** a toast with the same id replaces it */
    id?: ToastId;
    title?: ReactNode;
    message?: ReactNode;
    tone?: AlertTone;
    /** 0 keeps it until dismissed (default 4 s; 8 s for "danger") */
    durationMs?: number;
    action?: {
        label: ReactNode;
        onClick?: () => void;
    };
}
/**
 * Shows a toast; returns its id. `toast("Saved")`, `toast({ title, message, tone, durationMs, action: { label, onClick } })`.
 * `durationMs: 0` keeps it until dismissed. Shown by the nearest <ToastViewport> (AppProvider/ToastProvider add one).
 */
export declare function toast(input: string | ToastOptions): ToastId;
export declare namespace toast {
    var ok: (message: ReactNode, options?: ToastOptions) => ToastId;
    var warn: (message: ReactNode, options?: ToastOptions) => ToastId;
    var error: (message: ReactNode, options?: ToastOptions) => ToastId;
    var info: (message: ReactNode, options?: ToastOptions) => ToastId;
}
/** Removes a toast (all of them without an id). */
export declare function dismissToast(id?: ToastId): void;
export type ToastPosition = "bottom-right" | "bottom" | "top-right" | "top";
export interface ToastViewportProps {
    position?: ToastPosition;
}
/**
 * Where toasts appear (bottom-right, above Desktop's dock). `position`: "bottom-right" | "bottom" | "top-right" | "top".
 */
export declare function ToastViewport({ position }: ToastViewportProps): import('react').ReactPortal | null;
export interface ToastProviderProps {
    position?: ToastPosition;
    children?: ReactNode;
}
/** Adds a ToastViewport; `useToast()` below it returns toast(). */
export declare function ToastProvider({ position, children }: ToastProviderProps): import('react').JSX.Element;
/** The toast() function (toast.ok / .warn / .error / .info). */
export declare function useToast(): typeof toast;
export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    open?: boolean;
    onClose?: () => void;
    title?: ReactNode;
    /** buttons */
    footer?: ReactNode;
    size?: "sm" | "md" | "lg";
    dismissable?: boolean;
}
/**
 * A modal dialog over a scrim. `open` + `onClose`; `title`, `footer` (buttons); `size` "sm" | "md" | "lg";
 * `dismissable` (default true): Escape and a scrim click close it.
 */
export declare function Modal({ open, onClose, title, footer, size, dismissable, className, children, ...rest }: ModalProps): import('react').ReactPortal | null;
export interface ConfirmOptions {
    title?: ReactNode;
    message?: ReactNode;
    /** a red confirm button */
    danger?: boolean;
    confirmLabel?: ReactNode;
    cancelLabel?: ReactNode;
}
export interface PromptOptions extends ConfirmOptions {
    defaultValue?: string;
    placeholder?: string;
    /** false allows an empty answer */
    required?: boolean;
}
/** Hosts useConfirm / usePrompt dialogs (AppProvider includes it). */
export declare function DialogProvider({ children }: {
    children?: ReactNode;
}): import('react').JSX.Element;
/** `const confirm = useConfirm(); if (await confirm({ title, message, danger, confirmLabel })) …` → true/false. */
export declare function useConfirm(): (options?: ConfirmOptions | string) => Promise<boolean>;
/** `const prompt = usePrompt(); const name = await prompt({ title, defaultValue, placeholder })` → string or null. */
export declare function usePrompt(): (options?: PromptOptions | string) => Promise<string | null>;
export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
    /** px, or a CSS length */
    size?: CSSProperties["width"];
    /** for screen readers */
    label?: string;
}
/** A spinning ring; `label` for screen readers. */
export declare function Spinner({ size, label, className, ...rest }: SpinnerProps): import('react').JSX.Element;
export type ProgressTone = "primary" | "ok" | "warn" | "danger";
export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
    /** 0..1; none (or not finite) for an indeterminate bar */
    value?: number | null;
    tone?: ProgressTone;
    /** for screen readers */
    label?: string;
}
/** A bar: `value` 0..1, or none for an indeterminate one. `tone` colors it. */
export declare function Progress({ value, tone, label, className, ...rest }: ProgressProps): import('react').JSX.Element;
export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
    /** 0..1 */
    value?: number;
    /** px */
    size?: number;
    /** the ring's width, px */
    stroke?: number;
    tone?: ProgressTone;
}
/** A ring: `value` 0..1 (uploads, downloads); shows the percent inside unless `children` replace it. */
export declare function ProgressRing({ value, size, stroke, tone, className, children, ...rest }: ProgressRingProps): import('react').JSX.Element;
export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
    width?: CSSProperties["width"];
    height?: CSSProperties["height"];
}
/** A loading placeholder block. */
export declare function Skeleton({ width, height, className, style, ...rest }: SkeletonProps): import('react').JSX.Element;
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    /** an Icon name (default "info"); null for none */
    icon?: string | null;
    title?: ReactNode;
    message?: ReactNode;
    actions?: ReactNode;
    tone?: "warn" | "danger";
    /** centers it over a whole view */
    layer?: boolean;
}
/** A first-run / empty / error message with next steps. `layer` centers it over a whole view (a canvas, a 3D scene). */
export declare function EmptyState({ icon, title, message, actions, tone, layer, className, children, ...rest }: EmptyStateProps): import('react').JSX.Element;
export interface ErrorBoundaryProps {
    children?: ReactNode;
    /** an element, or `({ error, reset }) => element` */
    fallback?: ReactNode | ((caught: {
        error: unknown;
        reset: () => void;
    }) => ReactNode);
    onError?: (error: unknown, info: ErrorInfo) => void;
}
/**
 * Catches render errors below it and shows `fallback` (an element, or `({ error, reset }) => element`); reports via
 * `onError(error, info)`.
 */
export declare class ErrorBoundary extends Component<ErrorBoundaryProps, {
    error: unknown;
}> {
    reset: () => void;
    constructor(props: ErrorBoundaryProps);
    static getDerivedStateFromError(error: unknown): {
        error: unknown;
    };
    componentDidCatch(error: unknown, info: ErrorInfo): void;
    render(): string | number | bigint | boolean | Iterable<ReactNode> | Promise<string | number | bigint | boolean | import('react').ReactPortal | import('react').ReactElement<unknown, string | import('react').JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | import('react').JSX.Element | null | undefined;
}
