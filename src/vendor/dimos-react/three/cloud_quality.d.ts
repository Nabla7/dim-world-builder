import { Store } from './store.ts';
import { DataSource, Message, SubscribeOptions } from '../data.ts';
export type CloudQuality = "low" | "balanced" | "full";
export interface CloudPreset {
    id: CloudQuality;
    label: string;
    about: string;
    maxHz: number;
    quality: number;
    minQuality?: number;
}
export interface CloudRate {
    hz: number;
    pointsPerSecond: number;
    bytesPerSecond: number;
}
export declare const CLOUD_PRESETS: CloudPreset[];
/** The preset with `id`, else Balanced. */
export declare const cloudPreset: (id?: string | null) => CloudPreset;
/** The gateway subscription for a cloud at a preset. */
export declare function cloudOptions(preset: CloudPreset): SubscribeOptions;
/** What changes going to `to` (zenoh-gateway >= 0.5.1's Subscription.update: null removes an option). */
export declare function cloudChanges(to: CloudPreset): {
    maxHz: number;
    minQuality: number | null;
    encodeOptions: {
        quality: number;
    };
};
/** topic key → this viewer's preset (missing = Balanced) */
export declare const cloudQualities: Store<Record<string, CloudQuality>>;
export declare function setCloudQuality(key: string, quality: CloudQuality): void;
export declare const cloudQualityOf: (key: string) => CloudQuality;
/** topic key → live rate of each cloud being drawn (gone when it stops) */
export declare const cloudRates: Store<Record<string, CloudRate>>;
export declare function setCloudRate(key: string, rate: CloudRate | null | undefined): void;
/**
 * One cloud's subscription at its preset: a preset change updates it in place where the gateway can (else opens the
 * new one, then closes the old), and it counts what arrives.
 */
export declare class CloudStream {
    #private;
    onMessage: (message: Message) => void;
    key: string;
    source: Pick<DataSource, "subscribe">;
    /**
     * @param source a data source
     */
    constructor(source: Pick<DataSource, "subscribe">, key: string, quality: CloudQuality, onMessage: (message: Message) => void, now?: number);
    get quality(): CloudQuality;
    setQuality(quality: CloudQuality): Promise<void>;
    /** scans, points and bytes a second since the last call */
    sample(now?: number): CloudRate;
    close(): void;
}
export declare const formatCount: (count: number) => string;
export declare const formatBytes: (bytes: number) => string;
