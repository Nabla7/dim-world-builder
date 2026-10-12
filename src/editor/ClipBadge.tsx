// The top bar's clip warning: a moment after each edit the backend checks every pair of collision shapes (MuJoCo) and
// this lists the pairs that interpenetrate; clicking one selects the first item and glides the camera to the spot.
import { useEffect, useState } from "react";
import * as api from "../api.ts";
import { Button } from "../ui.ts";
import { keyedProject } from "../world/keys.ts";
import type { Vec3 } from "../world/types.ts";
import { view } from "./palette.ts";
import { getState, select, useEditor } from "./store.ts";

/** wait this long after the last edit before checking */
const CHECK_AFTER_MS = 2500;

export function ClipBadge() {
  const project = useEditor((s) => s.project);
  const [clips, setClips] = useState<api.Clip[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api.checkClips(project).then((report) => current && setClips(report.clips)).catch(() => {});
    }, CHECK_AFTER_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [project]);
  if (!clips.length) return null;
  const show = (clip: api.Clip) => {
    const item = keyedProject(getState().project).items.find((i) => i.key === clip.a.key);
    if (item) select(item.id);
    const camera = view.camera?.get();
    if (camera) {
      // keep looking from the same side, 4 m from the spot
      const away = camera.eye.map((v, i) => v - camera.target[i]);
      const length = Math.hypot(...away) || 1;
      const eye = clip.at.map((v, i) => v + (away[i] / length) * 4) as Vec3;
      view.camera?.goTo(eye, clip.at);
    }
    setOpen(false);
  };
  return (
    <div style={{ position: "relative" }}>
      <Button size="sm" variant="warn" icon="alert" onClick={() => setOpen(!open)} data-testid="clip-badge">
        {clips.length} clipping
      </Button>
      {open && (
        <div
          data-testid="clip-list"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 20,
            width: 360,
            maxHeight: 320,
            overflow: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 4,
          }}
        >
          {clips.map((clip) => (
            <button
              type="button"
              key={`${clip.a.key}/${clip.b.key}`}
              onClick={() => show(clip)}
              data-testid={`clip-${clip.a.key}-${clip.b.key}`}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                background: "transparent",
                border: 0,
                color: "var(--fg)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {clip.a.name} <span style={{ color: "var(--muted-fg)" }}>({clip.a.key})</span> ↔ {clip.b.name}{" "}
              <span style={{ color: "var(--muted-fg)" }}>({clip.b.key})</span> · {Math.round(clip.depth_m * 100)} cm
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
