/** Whether this page is in a frame (Desktop's), so it can ask Desktop for things. */
export declare const framedByDesktop: () => boolean;
/** Posts a dimos:* message to the Desktop framing this page. */
export declare const toDesktop: (message: {
    type: string;
    [key: string]: unknown;
}) => void;
/** Calls `handler` with each message Desktop (the parent, same origin) posts of this type. */
export declare function useDesktopMessage(type: string, handler: (data: Record<string, unknown>) => void): void;
/**
 * Whether to draw the page's own top bar: always off Desktop; framed, once Desktop says so (dimos:chrome-ok).
 * `{ pausable: true }` tells Desktop the page stops polling while hidden (useDesktopVisible), so it may preload it.
 */
export declare function useDesktopChrome(features?: {
    pausable?: boolean;
}): boolean;
/** Whether the page is shown: false from the start with ?hidden=1 (Desktop preloading it), then per dimos:visible. */
export declare function useDesktopVisible(): boolean;
export interface EditorStatus {
    ok: boolean;
    text: string;
}
/** `open(file, line)` asks Desktop to open a file in the user's editor (null when not framed); `status` is its answer. */
export declare function useDesktopEditor(): {
    open: ((file: string, line: number) => void) | null;
    status: EditorStatus | null;
};
/** One line saying how opening a file in the editor went (nothing before an answer). */
export declare function EditorNote({ status, className }: {
    status: EditorStatus | null;
    className?: string;
}): import('react').JSX.Element | null;
