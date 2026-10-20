import { HTMLAttributes, ReactNode } from 'react';
export interface LogRecord {
    timestamp: string;
    level: string;
    logger?: string;
    event: string;
    /** more fields: short ones show as chips, multi-line ones under the line, a traceback as a traceback */
    extra?: Record<string, unknown>;
    /** the record as written (its tooltip) */
    raw?: string;
}
export declare const LOG_LEVELS: string[];
/** A record's traceback (from `traceback_lines` or a traceback-shaped `exception`), and its other fields. */
export declare function splitRecord(record: LogRecord): {
    traceback: string | null;
    where: string;
    fields: [string, unknown][];
};
export interface StructuredLogProps extends HTMLAttributes<HTMLDivElement> {
    records: LogRecord[];
    /** keeps the newest record in view; scrolling up (or opening folded frames) turns it off through onFollowChange */
    follow?: boolean;
    onFollowChange?: (follow: boolean) => void;
    /** the lowest level shown, with onLevelChange: a level picker (filtering is yours, e.g. on the server) */
    level?: string;
    onLevelChange?: (level: string) => void;
    /** the search, with onQueryChange: a search box (filtering is yours) */
    query?: string;
    onQueryChange?: (query: string) => void;
    /** shown over the records: "loading…", an error, "No log lines yet." */
    note?: ReactNode;
    /** between the filters and the records */
    banner?: ReactNode;
    onOpenFile?: (file: string, line: number) => void;
    formatPath?: (file: string) => string;
}
/**
 * A structured log: each record's time, level, logger and event, its short fields as chips, its multi-line fields
 * below and its traceback drawn frame by frame. The filters (level, search, follow) show when their handlers are given.
 */
export declare function StructuredLog({ records, follow, onFollowChange, level, onLevelChange, query, onQueryChange, note, banner, onOpenFile, formatPath, className, ...rest }: StructuredLogProps): import('react').JSX.Element;
