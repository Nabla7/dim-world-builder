import { HTMLAttributes } from 'react';
export interface TracebackFrame {
    kind: "frame";
    /** an exception group's "| " / "+ " prefix */
    gutter: string;
    indent: string;
    file: string;
    line: number;
    func: string;
    /** in an installed package or the standard library, not your own code */
    library: boolean;
    code: {
        text: string;
        marker: boolean;
    }[];
}
export type TracebackItem = TracebackFrame | {
    kind: "head" | "text" | "sep";
    gutter: string;
    text: string;
} | {
    kind: "exception";
    gutter: string;
    depth: number;
    lines: string[];
};
/** Whether a value is a Python traceback's text. */
export declare const isTraceback: (text: unknown) => text is string;
/** A traceback's lines as frames (with their code and ^^^ markers), headers and the exceptions raised. */
export declare function parseTraceback(text: string): TracebackItem[];
/** What was raised, outermost first, with its nesting in an exception group. */
export declare const exceptionsOf: (items: TracebackItem[]) => {
    depth: number;
    text: string;
}[];
export interface TracebackProps extends HTMLAttributes<HTMLDivElement> {
    text: string;
    /** opens one of your own frames (its file as `formatPath` shows it); without it, frames are plain text */
    onOpenFile?: (file: string, line: number) => void;
    /** how a file's path is shown and handed to onOpenFile (default: as written) */
    formatPath?: (file: string) => string;
}
/**
 * A Python traceback drawn frame by frame: your own frames stand out (and open with `onOpenFile`), each run of library
 * frames folds into one line, and what was raised is summed up below, the innermost exception in bold.
 */
export declare function Traceback({ text, onOpenFile, formatPath, className, ...rest }: TracebackProps): import('react').JSX.Element;
