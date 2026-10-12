import { HTMLAttributes, ReactNode } from 'react';
/** `code`, **bold**, *italic*, [links](url) → React nodes (no HTML passes through; only http(s), /, #, . links). */
export declare function markdownInline(text: string, key?: number): ReactNode[];
export interface MarkdownProps extends HTMLAttributes<HTMLDivElement> {
    text?: string;
    inline?: boolean;
}
/**
 * Markdown → themed React: headings, paragraphs, lists, fenced code, tables, `code`, **bold**, *italic*, [links](url).
 * No HTML passes through. `inline` renders a single paragraph without block margins.
 */
export declare function Markdown({ text, inline, className, ...rest }: MarkdownProps): import('react').JSX.Element | null;
export interface LiveValueProps extends HTMLAttributes<HTMLSpanElement> {
    value: number;
    format?: (value: number) => string;
}
/**
 * A number that briefly lights up when it changes (live counts, rates). `format(value)` → text.
 */
export declare function LiveValue({ value, format, className, ...rest }: LiveValueProps): import('react').JSX.Element;
/**
 * `html` without what runs or restyles: scripts, styles, frames, forms, `on*` handlers, `javascript:` URLs and inline
 * styles go; links open in a new tab; box-drawing in <pre> becomes ASCII. Browser only (DOMParser).
 */
export declare function sanitizeHtml(html: string | null | undefined): string;
export interface SafeHtmlProps extends Omit<HTMLAttributes<HTMLDivElement>, "dangerouslySetInnerHTML"> {
    html?: string;
}
/**
 * HTML a server rendered (a doc page, a README), sanitized (sanitizeHtml) and set in the theme's prose type (the same
 * as Markdown's).
 */
export declare function SafeHtml({ html, className, ...rest }: SafeHtmlProps): import('react').JSX.Element;
