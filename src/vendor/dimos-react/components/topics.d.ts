import { CSSProperties, HTMLAttributes } from 'react';
/** A message type's short name: `sensor_msgs.Image` → `Image`. */
export declare const messageTypeName: (type: string | null | undefined) => string;
/** The theme token a message type is drawn in (by type, else by package, else a stable pick): `info`, `warn`, … */
export declare function messageTypeToken(type: string | null | undefined): string;
/** The CSS color a message type is drawn in: `var(--warn)`, … */
export declare function messageTypeColor(type: string | null | undefined): string;
/** `12.3 Hz` (`123 Hz` from 100 up). */
export declare const formatRate: (hz: number) => string;
/** `850 B/s`, `1.2 MB/s`, … */
export declare function formatBandwidth(bytesPerSecond: number): string;
/** A cell's tint for `value` out of `max` (log scale, cool to hot); none at 0. */
export declare function heatStyle(value: number, max: number): CSSProperties | undefined;
export interface TopicRate {
    /** "/odom" */
    topic: string;
    type?: string;
    hz?: number;
    /** bytes per second */
    bps?: number;
}
export interface TopicRatesProps extends HTMLAttributes<HTMLDivElement> {
    rows: TopicRate[];
    /** shown when there are no rows (default "no topics on the bus") */
    empty?: string | null;
    /** rows visible before it scrolls (default 6.5) */
    visibleRows?: number;
}
/** A table of topics with their rate and bandwidth: each topic in its type's color, hot cells tinted, quiet rows dim. */
export declare function TopicRates({ rows, empty, visibleRows, className, style, ...rest }: TopicRatesProps): import('react').JSX.Element;
