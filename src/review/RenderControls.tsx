import { useEffect, useState } from "react";
import type { Focus, ReviewRender } from "./types.ts";

async function request<T>(
  path: "" | "/cancel" = "",
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    path === "" ? "api/review/renders" : "api/review/renders/cancel",
    body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? "The render request failed.");
  }
  return result;
}

function RenderImage({ job }: { job: ReviewRender }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <a
      className="sr-render-preview"
      href={job.image}
      target="_blank"
      rel="noreferrer"
      style={{ aspectRatio: job.focus.camera.aspect }}
    >
      {!loaded && <span>Loading image…</span>}
      <img
        src={job.image}
        alt={`Blender render of ${job.revision}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </a>
  );
}

export function RenderControls(
  { getFocus, ready }: { getFocus: () => Focus | null; ready: boolean },
) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<ReviewRender[]>([]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [quality, setQuality] = useState<"draft" | "final">("draft");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const poll = () =>
      request<{ available: boolean; busy: boolean; jobs: ReviewRender[] }>()
        .then((r) => {
          if (!disposed) {
            setAvailable(r.available);
            setBusy(r.busy);
            setJobs(r.jobs);
          }
        }).catch(() => {});
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const start = async () => {
    const focus = getFocus();
    if (!focus) return;
    setOpen(true);
    setSending(true);
    setError("");
    try {
      const job = await request<ReviewRender>("", { focus, quality });
      setJobs((previous) => [job, ...previous.filter((j) => j.id !== job.id)]);
      setBusy(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  const cancel = async (id: string) => {
    try {
      const job = await request<ReviewRender>("/cancel", { id });
      setJobs((previous) => previous.map((j) => j.id === id ? job : j));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="sr-render-controls">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        Renders{busy ? " · working" : ""}
      </button>
      <button
        onClick={start}
        disabled={!available || !ready || busy || sending}
        title={available
          ? "Render the current camera in Blender"
          : "Blender rendering is not configured on this host"}
      >
        {sending ? "Starting…" : "Render this view"}
      </button>
      {open && (
        <section className="sr-render-popover" aria-label="Blender renders">
          <header>
            <strong>Blender renders</strong>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close renders"
            >
              ×
            </button>
          </header>
          <p className="sr-helper">
            Source materials and lighting, from the view you choose. Rendering uses no LLM credits.
            You can keep exploring while it runs.
          </p>
          {!available && <p>Blender rendering is not enabled on this host.</p>}
          <div className="sr-render-quality">
            <label htmlFor="sr-render-quality">Quality</label>
            <select
              id="sr-render-quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as "draft" | "final")}
            >
              <option value="draft">Preview · 1280 px</option>
              <option value="final">High quality · 1920 px</option>
            </select>
            <button
              onClick={start}
              disabled={!available || !ready || busy || sending}
            >
              Render current view
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {!jobs.length && (
            <p className="sr-helper">
              No renders yet. Choose a view in the office, then render it here.
            </p>
          )}
          {jobs.map((job) => (
            <article className="sr-render-card" key={job.id}>
              <div>
                <strong>
                  {job.quality === "draft" ? "Preview" : "High quality"}
                </strong>
                <span>
                  {job.state === "running" ? "Rendering…" : job.state}
                </span>
              </div>
              <small>
                {job.revision} · {new Date(job.createdAt).toLocaleString()}
                {job.elapsedSeconds !== undefined ? ` · ${job.elapsedSeconds}s` : ""}
              </small>
              {job.image && <RenderImage job={job} />}
              {job.image && (
                <a
                  href={job.image}
                  download={`${job.revision}-${job.id.slice(0, 8)}.png`}
                >
                  Download image
                </a>
              )}
              {job.error && <p>{job.error}</p>}
              {job.state === "running" && (
                <button onClick={() => cancel(job.id)}>Cancel render</button>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
