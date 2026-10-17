import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { IconButton, useMediaQuery } from "../ui.ts";

/** a phone (or any narrow window): the view fills the screen and the panels are bottom sheets */
export function usePhone() {
  return useMediaQuery("(max-width: 759px)");
}

/** phone sizes: every control at least 40px tall (dimos-react's control heights), no sideways page scroll */
export const layoutCss = `
.dwb-phone { --dr-control-h: 40px; --dr-control-h-sm: 40px; overflow: hidden; touch-action: manipulation; }
.dwb-phone .dr-tabs__item, .dwb-phone .dr-segmented__item { min-height: 40px; }
.dwb-phone .dr-toggle { min-height: 40px; }
.dwb-edge { position: absolute; top: 0; bottom: 0; width: 10px; cursor: col-resize; touch-action: none; z-index: 5; }
.dwb-edge::after { content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; background: transparent; transition: background .15s; }
.dwb-edge:hover::after, .dwb-edge:focus-visible::after, .dwb-edge[data-dragging]::after { background: var(--ring, var(--accent, #6af)); }
.dwb-edge:focus-visible { outline: none; }
`;

function readWidth(key: string): number | null {
  try {
    const saved = Number(localStorage.getItem(key));
    return saved > 0 ? saved : null;
  } catch {
    return null;
  }
}
function writeWidth(key: string, width: number | null) {
  try {
    if (width === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // private window
  }
}

/** a side panel whose inner edge drags to resize it (double-click: back to its default); its width is kept per browser */
export function SidePanel(
  { side, storageKey, defaultWidth, min = 220, max = 640, style, children }: {
    side: "left" | "right";
    storageKey: string;
    defaultWidth: number;
    min?: number;
    max?: number;
    style?: CSSProperties;
    children: ReactNode;
  },
) {
  // the view keeps at least this much of the window
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, innerWidth - 360, w)));
  const [width, setWidth] = useState(() => clamp(readWidth(storageKey) ?? defaultWidth));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const sign = side === "left" ? 1 : -1;
  const commit = (w: number) => {
    setWidth(w);
    writeWidth(storageKey, w);
  };
  return (
    <aside
      data-testid={`panel-${side}`}
      style={{
        ...style,
        position: "relative",
        flex: "none",
        width,
        [side === "left" ? "borderRight" : "borderLeft"]: "1px solid var(--border)",
      }}
    >
      {children}
      <div
        className="dwb-edge"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${side} panel`}
        aria-valuenow={width}
        tabIndex={0}
        data-testid={`panel-${side}-edge`}
        data-dragging={dragging || undefined}
        style={{ [side === "left" ? "right" : "left"]: -6 }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            setWidth(clamp(drag.current.width + sign * (e.clientX - drag.current.x)));
          }
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = null;
          setDragging(false);
          writeWidth(storageKey, width);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => {
          setWidth(clamp(defaultWidth));
          writeWidth(storageKey, null);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 64 : 16;
          if (e.key === "ArrowLeft") commit(clamp(width - sign * step));
          else if (e.key === "ArrowRight") commit(clamp(width + sign * step));
          else return;
          e.preventDefault();
        }}
      />
    </aside>
  );
}

/** a phone's bottom sheet over the view: the grip or ✕ closes it (so does a swipe down on its head) */
export function Sheet({ open, title, onClose, testId, children }: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  testId?: string;
  children: ReactNode;
}) {
  const swipe = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  return (
    <section
      data-testid={testId}
      data-open={open || undefined}
      aria-hidden={!open}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "min(64dvh, 640px)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderRadius: "14px 14px 0 0",
        boxShadow: "0 -8px 28px rgba(0,0,0,.35)",
        transform: open ? `translateY(${pull}px)` : "translateY(105%)",
        transition: swipe.current === null ? "transform .22s ease" : "none",
        visibility: open ? "visible" : "hidden",
        paddingBottom: "var(--dim-inset-bottom, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px 4px 14px",
          touchAction: "none",
          borderBottom: "1px solid var(--border)",
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          swipe.current = e.clientY;
        }}
        onPointerMove={(e) => {
          if (swipe.current !== null) setPull(Math.max(0, e.clientY - swipe.current));
        }}
        onPointerUp={() => {
          if (swipe.current === null) return;
          swipe.current = null;
          if (pull > 70) onClose();
          setPull(0);
        }}
        onPointerCancel={() => {
          swipe.current = null;
          setPull(0);
        }}
      >
        <div style={{ flex: 1, minWidth: 0, font: "600 14px system-ui" }}>{title}</div>
        <IconButton
          icon="close"
          label="Close"
          onClick={onClose}
          data-testid={testId && `${testId}-close`}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 5,
          left: "50%",
          width: 36,
          height: 4,
          marginLeft: -18,
          borderRadius: 2,
          background: "var(--border-strong, var(--border))",
          pointerEvents: "none",
        }}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </section>
  );
}
