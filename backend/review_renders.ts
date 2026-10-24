/** One bounded Blender job at a time. Saved renders belong to a source revision. */
import type { Bundle, Focus, ReviewRender } from "../src/review/types.ts";

export function reviewRenders(root: string) {
  const binary = Deno.env.get("DIM_SCENE_REVIEW_BLENDER");
  const device = Deno.env.get("DIM_SCENE_REVIEW_DEVICE") ?? "AUTO";
  let initialized: Promise<void> | undefined;
  const jobs = new Map<string, ReviewRender>();
  let active: string | null = null;
  let child: Deno.ChildProcess | null = null;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const save = async (job: ReviewRender) => {
    const path = `${root}/${job.id}/job.json`;
    const temp = `${path}.${crypto.randomUUID()}.tmp`;
    await Deno.writeTextFile(temp, JSON.stringify(job, null, 2) + "\n");
    await Deno.rename(temp, path);
  };
  const load = () =>
    initialized ??= (async () => {
      await Deno.mkdir(root, { recursive: true });
      for await (const entry of Deno.readDir(root)) {
        if (!entry.isDirectory || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
        try {
          const job: ReviewRender = JSON.parse(
            await Deno.readTextFile(`${root}/${entry.name}/job.json`),
          );
          if (job.state === "running") {
            job.state = "failed";
            job.error =
              "Rendering was interrupted by a workspace restart. Please render again.";
            job.finishedAt = new Date().toISOString();
            await save(job);
          }
          jobs.set(job.id, job);
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
      }
    })();
  const stop = () => {
    const process = child;
    try {
      process?.kill("SIGTERM");
    } catch { /* Already exited. */ }
    killTimer = setTimeout(() => {
      try {
        process?.kill("SIGKILL");
      } catch { /* Already exited. */ }
    }, 5000);
  };
  const shutdown = () => {
    stop();
    Deno.exit(143);
  };
  const run = async (job: ReviewRender, bundle: Bundle) => {
    const cancelled = () => job.state === "cancelled";
    const dir = `${root}/${job.id}`;
    const started = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let log: Deno.FsFile | undefined;
    let timedOut = false;
    try {
      // Copy first, then hash the copy: a concurrent authoring process cannot
      // change what this job renders after validation.
      await Deno.copyFile(bundle.source_blend, `${dir}/source.blend`);
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            await Deno.readFile(`${dir}/source.blend`),
          ),
        ),
      ].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hash !== bundle.source_sha256) {
        throw new Error(
          "The Blender source changed. Publish its new revision before rendering.",
        );
      }
      if (cancelled()) return;
      await Deno.writeTextFile(
        `${dir}/request.json`,
        JSON.stringify({
          ...job,
          calibration: bundle.evidence.calibration,
        }),
      );
      log = await Deno.open(`${dir}/render.log`, {
        create: true,
        write: true,
        truncate: true,
      });
      child = new Deno.Command(binary!, {
        args: [
          "--background",
          "--disable-autoexec",
          `${dir}/source.blend`,
          "--threads",
          "4",
          "--python-exit-code",
          "1",
          "--python",
          new URL("../tools/review/render_view.py", import.meta.url).pathname,
          "--",
          "--request",
          `${dir}/request.json`,
          "--output",
          `${dir}/image.png`,
          "--device",
          device,
        ],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
        env: { PYTHONUNBUFFERED: "1" },
      }).spawn();
      Deno.addSignalListener("SIGTERM", shutdown);
      timeout = setTimeout(() => {
        timedOut = true;
        stop();
      }, 15 * 60 * 1000);
      let tail = "";
      const read = async (stream: ReadableStream<Uint8Array>) => {
        const decoder = new TextDecoder();
        for await (const chunk of stream) {
          tail = (tail + decoder.decode(chunk, { stream: true })).slice(-4000);
          await log!.write(chunk);
        }
      };
      await Promise.all([read(child.stdout), read(child.stderr)]);
      const status = await child.status;
      if (cancelled()) return;
      if (!status.success || timedOut) {
        // Keep the diagnostic in the job log; the UI gets a short useful message.
        console.error(`Blender render ${job.id} failed: ${tail}`);
        throw new Error(
          timedOut
            ? "The render exceeded 15 minutes. Try Preview quality."
            : `Blender could not finish this render (exit ${status.code}). Its log is saved with the job.`,
        );
      }
      const result = JSON.parse(await Deno.readTextFile(`${dir}/image.json`));
      if (
        result.sourceSha256 !== job.sourceSha256 ||
        !(await Deno.stat(`${dir}/image.png`)).size
      ) {
        throw new Error("Blender returned a render for an unexpected source.");
      }
      job.state = "done";
      job.image = `files/review-renders/${job.id}/image.png`;
    } catch (error) {
      if (job.state !== "cancelled") {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      Deno.removeSignalListener("SIGTERM", shutdown);
      log?.close();
      child = null;
      job.finishedAt = new Date().toISOString();
      job.elapsedSeconds = Math.round((performance.now() - started) / 100) / 10;
      await save(job);
      await Deno.remove(`${dir}/source.blend`).catch(() => {});
      active = null;
    }
  };
  return {
    directory: root,
    async list(sceneId: string) {
      await load();
      return {
        available: !!binary,
        busy: active !== null,
        jobs: [...jobs.values()].filter((j) => j.sceneId === sceneId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40),
      };
    },
    async start(bundle: Bundle, focus: Focus, quality: unknown) {
      await load();
      if (!binary) {
        throw new Error("Blender rendering is not configured on this host.");
      }
      if (active) {
        throw new Error(
          "Another view is rendering. Wait for it or cancel it first.",
        );
      }
      if (focus.cutHeight < 90) {
        throw new Error("Turn off the building cutaway before rendering.");
      }
      if (focus.camera.aspect < 0.5 || focus.camera.aspect > 3) {
        throw new Error("Unsupported image aspect ratio.");
      }
      if (quality !== "draft" && quality !== "final") {
        throw new Error("Choose Preview or High quality.");
      }
      const job: ReviewRender = {
        id: crypto.randomUUID(),
        sceneId: bundle.id,
        revision: bundle.revision,
        sourceSha256: bundle.source_sha256,
        focus: structuredClone(focus),
        quality,
        state: "running",
        createdAt: new Date().toISOString(),
      };
      active = job.id;
      try {
        await Deno.mkdir(`${root}/${job.id}`);
        await save(job);
        jobs.set(job.id, job);
        void run(job, bundle).catch((e) => {
          active = null;
          console.error(e);
        });
        return structuredClone(job);
      } catch (error) {
        active = null;
        throw error;
      }
    },
    async cancel(id: string) {
      await load();
      const job = jobs.get(id);
      if (!job) throw new Error("Render not found.");
      if (job.id === active && job.state === "running") {
        job.state = "cancelled";
        stop();
        await save(job);
      }
      return job;
    },
  };
}
