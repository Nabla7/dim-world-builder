/** Review data belongs to the app's dataDir; source bundles are read-only. */
import type { Bundle, Focus, ReviewNote } from "../src/review/types.ts";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
export function reviewRoutes(bundleDir: string | undefined, dataDir: string) {
  let bundle: Bundle | undefined;
  let focus: Focus | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = tail.then(op, op);
    tail = next.catch(() => {});
    return next;
  };
  const load = async () => {
    if (!bundleDir) {
      throw new Error("No review bundle configured. Start with --review /path/to/bundle.");
    }
    if (!bundle) {
      bundle = {
        ...JSON.parse(await Deno.readTextFile(`${bundleDir}/scene.json`)),
        evidence: JSON.parse(await Deno.readTextFile(`${bundleDir}/evidence.json`)),
      } as Bundle;
    }
    return bundle;
  };
  const notesDir = async () =>
    `${dataDir}/review/${(await load()).id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const notes = async (): Promise<ReviewNote[]> => {
    try {
      return JSON.parse(await Deno.readTextFile(`${await notesDir()}/notes.json`));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return [];
      throw e;
    }
  };
  const save = async (all: ReviewNote[]) => {
    const dir = await notesDir();
    await Deno.mkdir(dir, { recursive: true });
    const temp = `${dir}/notes.${crypto.randomUUID()}.tmp`;
    await Deno.writeTextFile(temp, JSON.stringify(all, null, 2) + "\n");
    await Deno.rename(temp, `${dir}/notes.json`);
  };
  const image = async (data: unknown, name: string): Promise<string | undefined> => {
    if (data === undefined || data === null) return undefined;
    if (typeof data !== "string" || data.length > 12_000_000) {
      throw new Error("Image must be PNG/JPEG, at most 9 MB.");
    }
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match) throw new Error("Only PNG or JPEG images are accepted.");
    const dir = await notesDir();
    await Deno.mkdir(`${dir}/images`, { recursive: true });
    const filename = `${name}.${match[1] === "jpeg" ? "jpg" : "png"}`;
    await Deno.writeFile(
      `${dir}/images/${filename}`,
      Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)),
    );
    return `files/review-notes/${filename}`;
  };
  const validFocus = async (raw: unknown): Promise<Focus> => {
    const v = raw as Focus;
    const b = await load();
    const finite = (a: unknown, count: number) =>
      Array.isArray(a) && a.length === count &&
      a.every((n) => typeof n === "number" && Number.isFinite(n));
    if (
      !v || v.revision !== b.revision || !v.camera || !finite(v.camera.position, 3) ||
      !finite(v.camera.quaternion, 4) ||
      !finite(v.camera.target, 3) || !Number.isFinite(v.camera.fov) || v.camera.fov <= 0 ||
      v.camera.fov >= 179 ||
      !Number.isFinite(v.camera.aspect) || v.camera.aspect <= 0 || !Number.isFinite(v.cutHeight) ||
      typeof v.mode !== "string"
    ) throw new Error("Invalid camera/revision.");
    if (v.point !== null && !finite(v.point, 3)) throw new Error("Invalid metric point.");
    if (v.objectId !== null && !b.objects.some((o) => o.id === v.objectId)) {
      throw new Error("Unknown object ID.");
    }
    if (v.sourceSecond !== null && !b.evidence.views.some((c) => c.second === v.sourceSecond)) {
      throw new Error("Unknown recorded camera.");
    }
    return {
      revision: v.revision,
      camera: v.camera,
      sourceSecond: v.sourceSecond,
      objectId: v.objectId,
      point: v.point,
      cutHeight: v.cutHeight,
      mode: v.mode,
    };
  };
  const file = async (dir: string, name: string) => {
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").includes("..")) {
      return json({ error: "Invalid path" }, 400);
    }
    try {
      const f = await Deno.open(`${dir}/${name}`);
      const ext = name.split(".").pop();
      return new Response(f.readable, {
        headers: {
          "content-type": ext === "png"
            ? "image/png"
            : ext === "jpg"
            ? "image/jpeg"
            : ext === "json"
            ? "application/json"
            : "model/gltf-binary",
          "cache-control": "no-cache",
        },
      });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return json({ error: "File not found" }, 404);
      throw e;
    }
  };
  return async (req: Request, url: URL): Promise<Response | null> => {
    const path = url.pathname;
    if (!path.startsWith("/api/review") && !path.startsWith("/files/review")) return null;
    try {
      if (path === "/api/review/bundle" && req.method === "GET") return json(await load());
      if (path === "/api/review/context" && req.method === "GET") {
        const b = await load();
        return json({
          scene: {
            id: b.id,
            revision: b.revision,
            source: b.source_blend,
            sha256: b.source_sha256,
            units: b.units,
            up: b.up,
          },
          focus,
          notes: await notes(),
          limitations: b.limitations,
          selectedObject: focus?.objectId ? b.objects.find((o) => o.id === focus!.objectId) : null,
          instruction:
            "Use objectId and project-frame metres. Notes are requests, not applied Blender changes. Keep the reviewed source immutable; author a new revision for review.",
        });
      }
      if (path === "/api/review/focus" && req.method === "POST") {
        focus = await validFocus(await req.json());
        return json({ saved: true });
      }
      if (path === "/api/review/notes" && req.method === "GET") return json(await notes());
      if (path === "/api/review/notes" && req.method === "POST") {
        return await serial(async () => {
          const raw = await req.json();
          const context = await validFocus(raw);
          if (
            typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 12000
          ) throw new Error("Write a note (at most 12,000 characters).");
          const strokes = raw.strokes ?? [];
          if (
            !Array.isArray(strokes) || strokes.length > 100 ||
            strokes.some((s) =>
              !Array.isArray(s.points) || s.points.length > 5000 ||
              s.points.some((p: number[]) =>
                !Array.isArray(p) || p.length !== 2 ||
                p.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
              )
            )
          ) throw new Error("Invalid drawing.");
          const id = crypto.randomUUID();
          const note: ReviewNote = {
            ...context,
            id,
            text: raw.text.trim(),
            strokes,
            createdAt: new Date().toISOString(),
            status: "open",
            screenshot: await image(raw.screenshot, `${id}-view`),
            attachment: await image(raw.attachment, `${id}-photo`),
          };
          const all = await notes();
          all.push(note);
          await save(all);
          return json(note, 201);
        });
      }
      if (path === "/api/review/notes/status" && req.method === "POST") {
        return await serial(async () => {
          const body = await req.json();
          if (!["open", "resolved"].includes(body.status)) throw new Error("Invalid status.");
          const all = await notes();
          const note = all.find((n) => n.id === body.id);
          if (!note) return json({ error: "Note not found" }, 404);
          note.status = body.status;
          await save(all);
          return json(note);
        });
      }
      if (path.startsWith("/files/review-notes/") && req.method === "GET") {
        return await file(`${await notesDir()}/images`, path.slice("/files/review-notes/".length));
      }
      if (path.startsWith("/files/review/") && req.method === "GET") {
        await load();
        return await file(bundleDir!, path.slice("/files/review/".length));
      }
      return json({ error: "Unknown review route or method" }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  };
}
