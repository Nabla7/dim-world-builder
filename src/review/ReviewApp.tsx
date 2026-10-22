import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { ReviewViewer } from "./viewer.ts";
import type { Pick } from "./viewer.ts";
import type { Bundle, Focus, ReviewNote, SourceView, Stats, Stroke } from "./types.ts";
import "./review.css";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `api/review/${path}`,
    body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}
const file = (path: string) => `files/review/${path}`;
const time = (second: number) =>
  `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
const readable = (id: string) => id.replace(/_/g, " ");

export function ReviewApp() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("Opening the review bundle…");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<SourceView | null>(null);
  const [matched, setMatched] = useState(false);
  const [presentation, setPresentation] = useState<"live" | "compare" | "cycles">("live");
  const [wipe, setWipe] = useState(50);
  const [nav, setNav] = useState<"orbit" | "walk">("walk");
  const [level, setLevel] = useState<"all" | "ground" | "upper">("all");
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [attachment, setAttachment] = useState<string | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<"notes" | "source">("notes");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 800, height: 450 });
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReviewViewer | null>(null);
  const drawingNow = useRef(false);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useRef({ pick, view, presentation });
  state.current = { pick, view, presentation };
  const currentFocus = (): Focus | null => {
    const v = viewer.current;
    if (!v || !bundle) return null;
    return {
      revision: bundle.revision,
      camera: v.state(),
      sourceSecond: v.isMatched() ? state.current.view?.second ?? null : null,
      objectId: state.current.pick?.object.id ?? null,
      point: state.current.pick?.point ?? null,
      cutHeight: v.clip.constant,
      mode: state.current.presentation,
    };
  };
  const focusRef = useRef(currentFocus);
  focusRef.current = currentFocus;
  const syncFocus = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const focus = focusRef.current();
      if (focus) api("focus", focus).catch((e) => setError(e.message));
    }, 300);
  };
  useEffect(() => {
    document.title = "SF555 · Scene Review";
    let cancelled = false;
    Promise.all([api<Bundle>("bundle"), api<ReviewNote[]>("notes")]).then(([b, n]) => {
      if (!cancelled) {
        setBundle(b);
        setNotes(n);
      }
    }).catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.max(16, Math.floor(Math.min(width, height * 16 / 9) / 16) * 16);
      setFrameSize({ width: w, height: w * 9 / 16 });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!bundle || !host.current) return;
    const v = new ReviewViewer(host.current, bundle);
    viewer.current = v;
    let cancelled = false;
    v.onPick = (p) => {
      setPick(p);
      setNotice("Object selected. Describe the change in the review panel.");
      setPanel("notes");
      syncFocus();
    };
    v.onStats = setStats;
    v.onMove = () => {
      const m = v.isMatched();
      setMatched(m);
      if (!m) setPresentation("live");
      syncFocus();
    };
    v.load(setLoading).then(() => {
      if (cancelled) return;
      setReady(true);
      v.setMode("walk");
      const initial = bundle.evidence.views.find((c) => c.second === 580) ??
        bundle.evidence.views[0];
      setView(initial);
      state.current.view = initial;
      v.source(initial);
      syncFocus();
    }).catch((e) => {
      if (!cancelled) {
        setError(e.message);
        setLoading("");
      }
    });
    // Small, explicit browser automation surface; the same API/context is available to agents.
    Object.assign(window, {
      sceneReview: {
        viewer: v,
        getState: () => ({ focus: focusRef.current(), ready: v.ready }),
        goToSecond: (second: number) => {
          const s = bundle.evidence.views.find((c) => c.second === second);
          if (s) {
            setView(s);
            state.current.view = s;
            v.source(s);
          }
        },
      },
    });
    return () => {
      cancelled = true;
      v.dispose();
      viewer.current = null;
    };
  }, [bundle]);
  const jump = (source: SourceView) => {
    if (!ready) return;
    setView(source);
    state.current.view = source;
    setPick(null);
    state.current.pick = null;
    setStrokes([]);
    setDrawing(false);
    viewer.current?.select(null);
    viewer.current?.source(source);
    setPresentation("live");
    setLeftOpen(false);
    setNotice("");
    syncFocus();
  };
  const overview = (floor: "all" | "ground" | "upper") => {
    setLevel(floor);
    setPick(null);
    state.current.pick = null;
    viewer.current?.select(null);
    setPresentation("live");
    setStrokes([]);
    setDrawing(false);
    setNav("orbit");
    viewer.current?.setMode("orbit");
    viewer.current?.overview(floor);
    setLeftOpen(false);
  };
  const navigate = (mode: "orbit" | "walk") => {
    setNav(mode);
    viewer.current?.setMode(mode);
    host.current?.focus();
  };
  const save = async () => {
    const focus = currentFocus();
    if (!focus || !text.trim()) return;
    setSaving(true);
    setError("");
    try {
      // Save what the reviewer actually saw, including the swipe and marks.
      // The separate camera/point/stroke fields remain machine-readable.
      const capture = document.createElement("canvas");
      capture.width = 1280;
      capture.height = 720;
      const ctx = capture.getContext("2d")!;
      const live = viewer.current!.renderer.domElement;
      ctx.drawImage(live, 0, 0, capture.width, capture.height);
      const stillImage = document.querySelector<HTMLImageElement>(".sr-frame .sr-render");
      const recordedImage = document.querySelector<HTMLImageElement>(".sr-frame .sr-recording");
      for (const image of [stillImage, recordedImage]) {
        if (!image) continue;
        if (!image.complete || !image.naturalWidth) {
          throw new Error("Wait for the comparison image to finish loading, then save again.");
        }
        ctx.save();
        if (image === recordedImage) {
          ctx.beginPath();
          ctx.rect(capture.width * wipe / 100, 0, capture.width, capture.height);
          ctx.clip();
        }
        ctx.drawImage(image, 0, 0, capture.width, capture.height);
        ctx.restore();
      }
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary");
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of strokes) {
        ctx.beginPath();
        stroke.points.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x * capture.width, y * capture.height);
          else ctx.lineTo(x * capture.width, y * capture.height);
        });
        ctx.stroke();
      }
      const note = await api<ReviewNote>("notes", {
        ...focus,
        text,
        strokes,
        screenshot: capture.toDataURL("image/jpeg", .86),
        attachment,
      });
      setNotes((n) => [...n, note]);
      setText("");
      setStrokes([]);
      setDrawing(false);
      setAttachment(undefined);
      setNotice(
        "Saved with object, metric point, camera and evidence. Ready for the next agent pass.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const restore = (note: ReviewNote) => {
    if (!bundle || !viewer.current) return;
    const source = bundle.evidence.views.find((s) => s.second === note.sourceSecond) ?? null;
    const object = bundle.objects.find((o) => o.id === note.objectId);
    setView(source);
    state.current.view = source;
    const p = object && note.point ? { object, point: note.point } : null;
    setPick(p);
    state.current.pick = p;
    viewer.current.restore(note.camera, source, note.cutHeight);
    viewer.current.select(note.objectId);
    setStrokes(note.strokes);
    setDrawing(false);
    setPresentation(
      note.mode === "compare" && source
        ? "compare"
        : note.mode === "cycles" && source?.render
        ? "cycles"
        : "live",
    );
    setNotice(
      `Viewing saved feedback from ${
        new Date(note.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }.`,
    );
    syncFocus();
  };
  const status = async (note: ReviewNote) => {
    try {
      const updated = await api<ReviewNote>("notes/status", {
        id: note.id,
        status: note.status === "open" ? "resolved" : "open",
      });
      setNotes((n) => n.map((v) => v.id === updated.id ? updated : v));
    } catch (e) {
      setError(String(e));
    }
  };
  const exportFeedback = async () => {
    try {
      const context = await api("context");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(context, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "sf555-review-feedback.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    }
  };
  const drawPoint = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const r = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    ];
  };
  const startDraw = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingNow.current = true;
    const point = drawPoint(e);
    setStrokes((s) => [...s, { points: [point] }]);
  };
  const moveDraw = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawingNow.current) return;
    const point = drawPoint(e);
    setStrokes((s) =>
      s.map((stroke, i) => i === s.length - 1 ? { points: [...stroke.points, point] } : stroke)
    );
  };
  const views = bundle?.evidence.views ?? [];
  const visible = views.filter((v) =>
    (showAll || v.label || v.reviewed) && (level === "all" || v.level === level) &&
    (!filter ||
      `${v.label ?? ""} ${v.second} ${time(v.second)}`.toLowerCase().includes(filter.toLowerCase()))
  );
  const anchors = views.filter((v) => v.label);
  const sourceVisible = matched && view;
  const comparing = presentation === "compare" && sourceVisible;
  const still = (presentation === "cycles" || comparing) && sourceVisible && view.render;
  const focusName = pick
    ? readable(pick.object.id)
    : matched && view
    ? view.label ?? `Recording ${time(view.second)}`
    : level === "ground"
    ? "Ground floor"
    : level === "upper"
    ? "Upper level"
    : "Whole building";
  return (
    <div className="sr-app">
      <header className="sr-header">
        <div className="sr-brand">
          <span className="sr-monogram">D</span>
          <div>
            <strong>
              Scene Review <span className="sr-muted">/ SF555</span>
            </strong>
            <small>A shared canvas for the real office</small>
          </div>
        </div>
        <div className="sr-header-actions">
          <span className="sr-badge">{bundle?.revision ?? "V11"} · reviewed baseline</span>
          <button onClick={exportFeedback} disabled={!ready}>Export feedback ↗</button>
        </div>
      </header>
      <div className="sr-mobile-bar">
        <button
          onClick={() => {
            setLeftOpen(!leftOpen);
            setRightOpen(false);
          }}
        >
          Places & views
        </button>
        <button
          onClick={() => {
            setRightOpen(!rightOpen);
            setLeftOpen(false);
          }}
        >
          Feedback ({notes.filter((n) => n.status === "open").length})
        </button>
      </div>
      <div className="sr-workspace">
        <aside
          className={`sr-left ${leftOpen ? "is-open" : ""}`}
          aria-label="Places and recording views"
        >
          <div className="sr-section-title">
            THE BUILDING <span>01</span>
          </div>
          <button className="sr-building" disabled={!ready} onClick={() => overview("all")}>
            <span>⌂</span>
            <div>
              <strong>Whole building</strong>
              <small>Open the roof · orbit & inspect</small>
            </div>
            <span>↗</span>
          </button>
          <div className="sr-segment">
            <button data-active={level === "all"} onClick={() => overview("all")} disabled={!ready}>
              All
            </button>
            <button
              data-active={level === "ground"}
              onClick={() => overview("ground")}
              disabled={!ready}
            >
              Ground
            </button>
            <button
              data-active={level === "upper"}
              onClick={() => overview("upper")}
              disabled={!ready}
            >
              Upper
            </button>
          </div>
          <div className="sr-section-title">
            RECORDED VIEWPOINTS <span>{views.length}</span>
          </div>
          <input
            className="sr-search"
            aria-label="Find a viewpoint"
            placeholder="Find a place or recording time…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="sr-check">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />{" "}
            Include every recorded viewpoint
          </label>
          <div className="sr-view-list">
            {visible.map((v) => (
              <button
                className="sr-view"
                key={v.second}
                data-active={matched && view?.second === v.second}
                onClick={() => jump(v)}
                disabled={!ready}
                title={`Recorded ${v.second}s · ${
                  v.render ? "Cycles render available" : "interactive preview"
                }`}
              >
                <img loading="lazy" src={file(v.thumbnail)} alt="" />
                <div>
                  <strong>{v.label ?? `Recording ${time(v.second)}`}</strong>
                  <small>
                    {time(v.second)} · {v.level === "ground" ? "Ground" : "Upper"}
                    {v.render ? " · ◈" : ""}
                  </small>
                </div>
              </button>
            ))}
          </div>
          <div className="sr-left-footer">
            Metres · original project coordinates<br />360 source poses · 76 Cycles views
          </div>
        </aside>
        <main className="sr-main">
          <div className="sr-view-toolbar">
            <div className="sr-segment">
              <button
                data-active={presentation === "live"}
                onClick={() => {
                  setPresentation("live");
                  syncFocus();
                }}
              >
                Walkthrough
              </button>
              <button
                disabled={!sourceVisible}
                data-active={presentation === "compare"}
                onClick={() => {
                  setPresentation("compare");
                  setDrawing(false);
                  syncFocus();
                }}
              >
                Compare
              </button>
              <button
                disabled={!sourceVisible || !view?.render}
                data-active={presentation === "cycles"}
                onClick={() => {
                  setPresentation("cycles");
                  setDrawing(false);
                  syncFocus();
                }}
              >
                Blender still
              </button>
            </div>
            <button
              className="sr-icon-button"
              aria-label="Return to this recorded camera"
              disabled={!view || !ready}
              onClick={() => view && jump(view)}
            >
              ↺ <span>Match camera</span>
            </button>
          </div>
          <div className="sr-stage" ref={stage}>
            <div className="sr-frame" style={frameSize as CSSProperties}>
              <div
                className="sr-canvas"
                ref={host}
                aria-label="Office 3D view. Click to select; W A S D to move, Q E to change height."
              />
              {still && (
                <img
                  className="sr-render"
                  src={file(still)}
                  alt="Existing Cycles render at the recorded camera"
                />
              )}
              {comparing && (
                <img
                  className="sr-recording"
                  src={file(view.image)}
                  alt="Original RGB recording, undistorted with its recorded calibration"
                  style={{ clipPath: `inset(0 0 0 ${wipe}%)` }}
                />
              )}
              {comparing && (
                <>
                  <div className="sr-wipe-line" style={{ left: `${wipe}%` }} />
                  <input
                    className="sr-wipe"
                    type="range"
                    min="0"
                    max="100"
                    value={wipe}
                    onChange={(e) => setWipe(+e.target.value)}
                    aria-label="Compare recording and reconstruction"
                  />
                  <span className="sr-image-label left">
                    {view.render ? "BLENDER / CYCLES" : "INTERACTIVE PREVIEW"}
                  </span>
                  <span className="sr-image-label right">RECORDING · {time(view.second)}</span>
                </>
              )}
              {!comparing && ready && (
                <span className="sr-image-label left">
                  {presentation === "cycles" ? "BLENDER / CYCLES" : "LIVE PBR PREVIEW"}
                  {matched && view ? ` · ${time(view.second)}` : ""}
                </span>
              )}
              <svg
                className={`sr-drawing ${drawing ? "is-drawing" : ""}`}
                viewBox="0 0 1000 562.5"
                preserveAspectRatio="none"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={() => {
                  drawingNow.current = false;
                }}
                onPointerCancel={() => {
                  drawingNow.current = false;
                }}
                aria-label="Draw feedback on this view"
              >
                {strokes.map((s, i) => (
                  <polyline
                    key={i}
                    points={s.points.map((p) => `${p[0] * 1000},${p[1] * 562.5}`).join(" ")}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
              {loading && !error && (
                <div className="sr-loading">
                  <div className="sr-spinner" />
                  <strong>Bringing the office into view</strong>
                  <span>{loading}</span>
                  <small>Whole building · original geometry · recorded textures</small>
                </div>
              )}
            </div>
          </div>
          <div className="sr-navigation">
            <div className="sr-segment">
              <button
                data-active={nav === "walk"}
                onClick={() => navigate("walk")}
                disabled={!ready}
              >
                Walk
              </button>
              <button
                data-active={nav === "orbit"}
                onClick={() => navigate("orbit")}
                disabled={!ready}
              >
                Orbit
              </button>
            </div>
            <span>
              {nav === "walk"
                ? "W A S D move · right-drag look · Q / E height"
                : "Drag orbit · right-drag pan · scroll zoom"}
              <span className="sr-key-hint">· click an object to point</span>
            </span>
            <button
              onClick={() => {
                viewer.current?.cut(viewer.current.clip.constant < 90 ? 100 : 6.2);
              }}
              disabled={!ready}
            >
              Cut roof
            </button>
          </div>
          <div className="sr-filmstrip" aria-label="Featured recording views">
            {anchors.map((v) => (
              <button
                key={v.second}
                data-active={view?.second === v.second && matched}
                onClick={() => jump(v)}
                disabled={!ready}
              >
                <img loading="lazy" src={file(v.thumbnail)} alt="" />
                <span>{v.label}</span>
                <small>{time(v.second)}</small>
              </button>
            ))}
          </div>
          <footer className="sr-status">
            <span className={`sr-dot ${ready ? "is-ready" : ""}`} />
            <span>
              {matched
                ? "Matched to recorded camera"
                : "Free camera · traversal is not physics-tested"}
            </span>
            <span className="sr-stats">
              {stats && ready
                ? `${stats.fps} fps · ${stats.calls.toLocaleString()} draws · ${
                  (stats.triangles / 1e6).toFixed(2)
                }M triangles`
                : ""}
            </span>
          </footer>
        </main>
        <aside
          className={`sr-right ${rightOpen ? "is-open" : ""}`}
          aria-label="Review and evidence"
        >
          <div className="sr-tabs">
            <button data-active={panel === "notes"} onClick={() => setPanel("notes")}>
              Review <span>{notes.filter((n) => n.status === "open").length}</span>
            </button>
            <button data-active={panel === "source"} onClick={() => setPanel("source")}>
              Evidence & scene
            </button>
          </div>
          {panel === "notes"
            ? (
              <>
                <div className="sr-review-body">
                  <div className="sr-section-title">WHAT SHOULD CHANGE?</div>
                  <h2>{focusName}</h2>
                  {pick
                    ? (
                      <div className="sr-selection">
                        <span>Selected in Blender</span>
                        <code>{pick.object.id}</code>
                        <small>
                          {pick.point.map((n) => n.toFixed(2)).join(", ")} m · project XYZ
                        </small>
                        <button
                          onClick={() => {
                            setPick(null);
                            viewer.current?.select(null);
                            syncFocus();
                          }}
                        >
                          Clear selection
                        </button>
                      </div>
                    )
                    : (
                      <p className="sr-helper">
                        Point at an object in the walkthrough, or leave a note about this view.
                      </p>
                    )}
                  <textarea
                    aria-label="Describe the change"
                    placeholder="What looks wrong? What should be different?"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={4}
                  />
                  <div className="sr-note-tools">
                    <button
                      data-active={drawing}
                      disabled={!ready}
                      onClick={() => setDrawing(!drawing)}
                    >
                      ✎ {drawing ? "Finish drawing" : "Draw on view"}
                    </button>
                    {strokes.length > 0 && (
                      <button onClick={() => setStrokes([])}>Clear marks</button>
                    )}
                    <label className="sr-upload" tabIndex={0}>
                      ＋ Photo<input
                        type="file"
                        accept="image/jpeg,image/png"
                        aria-label="Attach a reference photo"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 9_000_000) {
                            setError("Choose a photo smaller than 9 MB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => setAttachment(reader.result as string);
                          reader.readAsDataURL(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {attachment && (
                    <div className="sr-attachment">
                      <img src={attachment} alt="Attached reference" />
                      <button onClick={() => setAttachment(undefined)}>Remove photo</button>
                    </div>
                  )}
                  <button
                    className="sr-primary"
                    onClick={save}
                    disabled={!text.trim() || saving || !ready}
                  >
                    {saving ? "Saving…" : "Save feedback"}
                    <span>↗</span>
                  </button>
                  <p className="sr-fine">
                    Saves the object, camera, drawing and recording reference for the agent. Blender
                    changes are a separate, reviewable step.
                  </p>
                  {notice && <p className="sr-notice" role="status">{notice}</p>}
                </div>
                <div className="sr-notes-heading">
                  <strong>Saved feedback</strong>
                  <button
                    onClick={() =>
                      api<ReviewNote[]>("notes").then(setNotes).catch((e) => setError(e.message))}
                    aria-label="Refresh saved notes"
                  >
                    ↻
                  </button>
                </div>
                <div className="sr-notes">
                  {notes.length === 0
                    ? (
                      <div className="sr-empty">
                        <span>◎</span>
                        <strong>A useful conversation starts here.</strong>
                        <p>
                          Your notes stay attached to a place in the scene, even after you leave
                          this page.
                        </p>
                      </div>
                    )
                    : [...notes].reverse().map((n) => (
                      <article
                        key={n.id}
                        className={`sr-note ${n.status === "resolved" ? "is-resolved" : ""}`}
                      >
                        <button className="sr-note-camera" onClick={() => restore(n)}>
                          {n.screenshot && <img src={n.screenshot} alt="Saved viewpoint" />}
                          <span>
                            {n.objectId
                              ? readable(n.objectId)
                              : n.sourceSecond !== null
                              ? `Recording ${time(n.sourceSecond)}`
                              : "Saved viewpoint"} ↗
                          </span>
                        </button>
                        <p>{n.text}</p>
                        {n.attachment && (
                          <a href={n.attachment} target="_blank" rel="noreferrer">
                            Reference photo ↗
                          </a>
                        )}
                        <div>
                          <small>
                            {n.status === "resolved" ? "Resolved" : "Open"} ·{" "}
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                          <button onClick={() => status(n)}>
                            {n.status === "open" ? "Resolve" : "Reopen"}
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </>
            )
            : (
              <div className="sr-evidence">
                <div className="sr-section-title">SOURCE OF TRUTH</div>
                <h2>
                  One building.<br />The same coordinates.
                </h2>
                <p>
                  The saved V11 Blender model is the authoring baseline. The walkthrough keeps its
                  geometry and scale.
                </p>
                <dl>
                  <dt>Source objects</dt>
                  <dd>{bundle?.objects.length.toLocaleString() ?? "—"}</dd>
                  <dt>Recorded cameras</dt>
                  <dd>{views.length}</dd>
                  <dt>Cycles comparisons</dt>
                  <dd>{views.filter((v) => v.render).length}</dd>
                  <dt>Image maps</dt>
                  <dd>{Object.keys(bundle?.images ?? {}).length}</dd>
                  <dt>Coordinates</dt>
                  <dd>Metres · Z up</dd>
                </dl>
                {view && (
                  <>
                    <h3>Current reference · {time(view.second)}</h3>
                    <img
                      className="sr-evidence-image"
                      src={file(view.image)}
                      alt="Undistorted RGB source"
                    />
                    <p className="sr-fine">
                      Original RGB, undistorted with the recorded camera calibration. Camera
                      comparisons use the recorded pose and asymmetric intrinsics.
                    </p>
                  </>
                )}
                <h3>Preview fidelity</h3>
                <p>
                  Recorded image textures and material values are retained. Live lighting is an
                  approximation; procedural bump, soft shadows and indirect Cycles lighting are not
                  baked yet.
                </p>
                <p>
                  “Blender still” shows the existing rendered result at 76 source positions. It is a
                  still image, not a live path-traced camera.
                </p>
                <h3>Simulation comes next</h3>
                <p>
                  This review does not certify collisions, doors or stair traversal. Native MuJoCo
                  export and robot launch remain a separate handoff.
                </p>
                <details>
                  <summary>Export approximations ({bundle?.warnings.length ?? 0})</summary>
                  <ul>{bundle?.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </details>
                <button onClick={exportFeedback}>Download agent context</button>
              </div>
            )}
        </aside>
      </div>
      {error && (
        <div className="sr-error" role="alert">
          <strong>Something needs attention</strong>
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      )}
    </div>
  );
}
