import { reviewRenders } from "./review_renders.ts";
import type { Bundle, Focus } from "../src/review/types.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

Deno.test("render jobs reject stale sources, exclude concurrent jobs, cancel their process and persist results", async () => {
  const root = await Deno.makeTempDir();
  const previous = Deno.env.get("DIM_SCENE_REVIEW_BLENDER");
  const focus: Focus = {
    revision: "V13",
    camera: {
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      target: [1, 2, 0],
      fov: 65,
      aspect: 16 / 9,
    },
    sourceSecond: null,
    objectId: null,
    point: null,
    cutHeight: 100,
    mode: "live",
  };
  try {
    const binary = `${root}/blender`;
    const marker = `${root}/started`;
    const quoted = "'" + marker.replaceAll("'", "'\\''") + "'";
    await Deno.writeTextFile(
      binary,
      `#!/bin/sh\nprintf started > ${quoted}\nexec sleep 30\n`,
    );
    await Deno.chmod(binary, 0o755);
    Deno.env.set("DIM_SCENE_REVIEW_BLENDER", binary);
    await Deno.writeTextFile(`${root}/source.blend`, "immutable scene fixture");
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await Deno.readFile(`${root}/source.blend`),
        ),
      ),
    ].map((n) => n.toString(16).padStart(2, "0")).join("");
    const bundle = {
      id: "office",
      revision: "V13",
      source_blend: `${root}/source.blend`,
      source_sha256: hash,
      evidence: { calibration: {} },
    } as Bundle;
    const renderer = reviewRenders(`${root}/jobs`);
    const job = await renderer.start(bundle, focus, "draft");
    let rejected = false;
    try {
      await renderer.start(bundle, focus, "draft");
    } catch {
      rejected = true;
    }
    assert(
      rejected,
      "a second job must not launch while the GPU slot is occupied",
    );
    for (let i = 0; i < 250; i++) {
      try {
        await Deno.stat(marker);
        break;
      } catch {
        await pause();
      }
    }
    assert(
      await Deno.readTextFile(marker) === "started",
      "the process really started",
    );
    await renderer.cancel(job.id);
    for (let i = 0; i < 250 && (await renderer.list("office")).busy; i++) {
      await pause();
    }
    const done = await renderer.list("office");
    assert(
      !done.busy && done.jobs[0].state === "cancelled",
      "cancel must stop the child and release the slot",
    );
    assert(
      (await reviewRenders(`${root}/jobs`).list("office")).jobs[0].state ===
        "cancelled",
      "job history survives a new backend",
    );
    await Deno.remove(marker);
    await Deno.writeTextFile(
      bundle.source_blend,
      "edited outside the published revision",
    );
    await renderer.start(bundle, focus, "draft");
    for (let i = 0; i < 250 && (await renderer.list("office")).busy; i++) {
      await pause();
    }
    const failed = (await renderer.list("office")).jobs[0];
    assert(
      failed.state === "failed" && failed.error?.includes("source changed"),
      "a mismatched source cannot produce a render",
    );
    let launched = true;
    try {
      await Deno.stat(marker);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) launched = false;
      else throw e;
    }
    assert(
      !launched,
      "stale geometry must be rejected before launching Blender",
    );
  } finally {
    if (previous === undefined) Deno.env.delete("DIM_SCENE_REVIEW_BLENDER");
    else Deno.env.set("DIM_SCENE_REVIEW_BLENDER", previous);
    await Deno.remove(root, { recursive: true });
  }
});
