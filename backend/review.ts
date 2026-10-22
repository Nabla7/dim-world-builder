/** Review data belongs to the app's dataDir; source bundles are read-only. */
import type {
  Bundle,
  Focus,
  ReviewNote,
  ReviewRevision,
  ViewCommand,
} from "../src/review/types.ts";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
export function reviewRoutes(bundleDir: string | undefined, dataDir: string) {
  let bundle: Bundle | undefined;
  let revisions: ReviewRevision[] = [];
  let initialize: Promise<void> | undefined;
  const originalDir = bundleDir;
  const revisionFile = `${dataDir}/review-revisions.json`;
  let focus:
    | (Focus & { screenshot?: string; attachment?: string; updatedAt: string })
    | null = null;
  let command: ViewCommand | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = tail.then(op, op);
    tail = next.catch(() => {});
    return next;
  };
  const readBundle = async (dir: string): Promise<Bundle> => {
    const loaded = {
      ...JSON.parse(await Deno.readTextFile(`${dir}/scene.json`)),
      evidence: JSON.parse(await Deno.readTextFile(`${dir}/evidence.json`)),
    } as Bundle;
    // Recorded RGB remains evidence across revisions; old Cycles stills do not.
    if (
      dir !== await Deno.realPath(originalDir!) &&
      loaded.evidence.render_source_sha256 !== loaded.source_sha256 &&
      Array.isArray(loaded.evidence.views)
    ) {
      loaded.evidence.views = loaded.evidence.views.map((v) => ({
        ...v,
        render: null,
      }));
    }
    return loaded;
  };
  const load = async () => {
    initialize ??= (async () => {
      try {
        const stored = JSON.parse(await Deno.readTextFile(revisionFile));
        // A different configured project starts a different review; never silently replace it.
        if (stored.originalDir === originalDir) {
          bundleDir = stored.activeDirectory;
          revisions = stored.revisions;
        }
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
    })();
    await initialize;
    if (!bundleDir) {
      throw new Error(
        "No review bundle configured. Start with --review /path/to/bundle.",
      );
    }
    if (!bundle) {
      bundleDir = await Deno.realPath(bundleDir);
      bundle = await readBundle(bundleDir);
      if (!revisions.some((r) => r.directory === bundleDir)) {
        revisions.push({ revision: bundle.revision, directory: bundleDir });
      }
    }
    return bundle;
  };
  const notesDir = async () =>
    `${dataDir}/review/${(await load()).id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const notes = async (): Promise<ReviewNote[]> => {
    try {
      return JSON.parse(
        await Deno.readTextFile(`${await notesDir()}/notes.json`),
      );
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
  const image = async (
    data: unknown,
    name: string,
  ): Promise<string | undefined> => {
    if (data === undefined || data === null) return undefined;
    if (typeof data !== "string" || data.length > 12_000_000) {
      throw new Error("Image must be PNG/JPEG, at most 9 MB.");
    }
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
      data,
    );
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
      !v || v.revision !== b.revision || !v.camera ||
      !finite(v.camera.position, 3) ||
      !finite(v.camera.quaternion, 4) ||
      !finite(v.camera.target, 3) || !Number.isFinite(v.camera.fov) ||
      v.camera.fov <= 0 ||
      v.camera.fov >= 179 ||
      !Number.isFinite(v.camera.aspect) || v.camera.aspect <= 0 ||
      !Number.isFinite(v.cutHeight) ||
      typeof v.mode !== "string"
    ) throw new Error("Invalid camera/revision.");
    if (v.point !== null && !finite(v.point, 3)) {
      throw new Error("Invalid metric point.");
    }
    if (v.objectId !== null && !b.objects.some((o) => o.id === v.objectId)) {
      throw new Error("Unknown object ID.");
    }
    if (
      v.sourceSecond !== null &&
      !b.evidence.views.some((c) => c.second === v.sourceSecond)
    ) {
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
      if (e instanceof Deno.errors.NotFound) {
        return json({ error: "File not found" }, 404);
      }
      throw e;
    }
  };
  return async (req: Request, url: URL): Promise<Response | null> => {
    const path = url.pathname;
    if (!path.startsWith("/api/review") && !path.startsWith("/files/review")) {
      return null;
    }
    try {
      if (path === "/api/review/bundle" && req.method === "GET") {
        return json(await load());
      }
      if (path === "/api/review/context" && req.method === "GET") {
        const b = await load();
        const allNotes = await notes();
        return json({
          scene: {
            id: b.id,
            revision: b.revision,
            source: b.source_blend,
            sha256: b.source_sha256,
            units: b.units,
            up: b.up,
            bundleDirectory: bundleDir,
          },
          revisions,
          authoring: {
            exporterScript:
              new URL("../tools/review/export_blender.py", import.meta.url)
                .pathname,
            publish:
              "Save a new .blend (never overwrite the baseline), export it to a new directory with --revision NAME, and copy evidence.json plus views/ from the current bundle. Previous Cycles stills are hidden on derived revisions: only set evidence.render_source_sha256 to the new scene SHA after regenerating those renders from that file. POST api/review/open with bundleDir and expectedRevision to show it. Previous revisions remain available for undo through the same endpoint. This handoff does not validate reconstruction accuracy or collisions.",
          },
          focus,
          notes: allNotes,
          recordedView: b.evidence.views.find((v) =>
            v.second === focus?.sourceSecond
          ) ?? null,
          latestSharedView: allNotes.at(-1) ?? null,
          viewCommand: command,
          limitations: b.limitations,
          selectedObject: focus?.objectId
            ? b.objects.find((o) => o.id === focus!.objectId)
            : null,
          instruction:
            "This is the user's shared Blender scene. A chat referring to View N means the saved note with number N, not a camera they may have moved to since. Inspect its image using GET api/review/view?noteId=ID; kind=recording or photo selects reference evidence. POST api/review/view can show a recorded camera, saved note, object or floor in the user's viewer; verify applied through GET api/review/updates. Use source object IDs and project-frame metres. Keep the reviewed source immutable; author a new Blender revision for requested geometry changes. Do not run the old reconstruction builder or use World Builder's primitive project API to replace this Blender reconstruction.",
        });
      }
      if (path === "/api/review/open" && req.method === "POST") {
        return await serial(async () => {
          const current = await load();
          const raw = await req.json();
          if (raw.expectedRevision !== current.revision) {
            return json({
              error: "Scene revision changed. Read context before publishing.",
            }, 409);
          }
          if (
            typeof raw.bundleDir !== "string" || !raw.bundleDir.startsWith("/")
          ) {
            throw new Error(
              "bundleDir must be an absolute local export directory.",
            );
          }
          const dir = await Deno.realPath(raw.bundleDir);
          const next = await readBundle(dir);
          if (
            next.id !== current.id || next.units !== current.units ||
            next.up !== current.up ||
            typeof next.revision !== "string" || !next.revision.trim() ||
            !Array.isArray(next.objects) || !next.objects.length ||
            !Array.isArray(next.evidence.views) ||
            typeof next.geometry !== "string" ||
            !/^[a-zA-Z0-9_.-]+$/.test(next.geometry)
          ) {
            throw new Error(
              "The export must preserve this project's identity, metric frame and valid scene manifest.",
            );
          }
          if (!(await Deno.stat(`${dir}/${next.geometry}`)).isFile) {
            throw new Error("Missing exported geometry.");
          }
          const known = revisions.find((r) => r.revision === next.revision);
          if (known && known.directory !== dir) {
            throw new Error(
              "Use a new revision name for a new export directory.",
            );
          }
          const baseline = JSON.parse(
            await Deno.readTextFile(`${originalDir}/scene.json`),
          );
          if (
            next.source_blend === baseline.source_blend &&
            next.source_sha256 !== baseline.source_sha256
          ) {
            throw new Error(
              "Save edits as a new Blender file; the reviewed baseline is immutable.",
            );
          }
          const history = known
            ? revisions
            : [...revisions, { revision: next.revision, directory: dir }];
          await Deno.mkdir(dataDir, { recursive: true });
          const temp = `${revisionFile}.${crypto.randomUUID()}.tmp`;
          await Deno.writeTextFile(
            temp,
            JSON.stringify({
              originalDir,
              activeDirectory: dir,
              revisions: history,
            }),
          );
          await Deno.rename(temp, revisionFile);
          bundleDir = dir;
          bundle = next;
          revisions = history;
          focus = null;
          command = { id: crypto.randomUUID(), reload: true, applied: false };
          return json({
            revision: next.revision,
            command,
            instruction:
              "Check updates for the browser's acknowledgement. Other revisions remain available through this endpoint.",
          });
        });
      }
      if (path === "/api/review/focus" && req.method === "POST") {
        return await serial(async () => {
          const raw = await req.json();
          const valid = await validFocus(raw);
          focus = {
            ...valid,
            screenshot: await image(raw.screenshot, "live-view"),
            attachment: await image(raw.attachment, "live-photo"),
            updatedAt: new Date().toISOString(),
          };
          return json({ saved: true });
        });
      }
      if (path === "/api/review/view" && req.method === "GET") {
        const b = await load();
        const id = url.searchParams.get("noteId");
        const view = id ? (await notes()).find((n) => n.id === id) : focus;
        if (!view) {
          return json(
            {
              error:
                "No captured view. Open Scene Review or select a saved note.",
            },
            404,
          );
        }
        const kind = url.searchParams.get("kind") ?? "screenshot";
        if (kind === "recording") {
          const source = b.evidence.views.find((v) =>
            v.second === view.sourceSecond
          );
          if (!source?.image) {
            return json(
              { error: "This camera has no matched recording." },
              404,
            );
          }
          return await file(bundleDir!, source.image);
        }
        if (kind !== "screenshot" && kind !== "photo") {
          return json({ error: "Unknown image kind" }, 400);
        }
        const imagePath = kind === "photo" ? view.attachment : view.screenshot;
        if (!imagePath) {
          return json({ error: `No ${kind} for this view.` }, 404);
        }
        return await file(
          `${await notesDir()}/images`,
          imagePath.split("/").at(-1)!,
        );
      }
      if (path === "/api/review/view" && req.method === "POST") {
        const raw = await req.json();
        const b = await load();
        if (
          raw.sourceSecond === undefined && raw.objectId === undefined &&
          raw.noteId === undefined && raw.level === undefined
        ) {
          throw new Error("Specify sourceSecond, objectId, noteId or level.");
        }
        if (
          raw.sourceSecond !== undefined &&
          !b.evidence.views.some((v) => v.second === raw.sourceSecond)
        ) throw new Error("Unknown recorded camera.");
        if (
          raw.objectId !== undefined &&
          !b.objects.some((o) => o.id === raw.objectId)
        ) {
          throw new Error("Unknown object ID.");
        }
        if (raw.noteId !== undefined) {
          const saved = (await notes()).find((n) => n.id === raw.noteId);
          if (!saved) throw new Error("Unknown shared view.");
          if (saved.revision !== b.revision) {
            throw new Error(
              `Open revision ${saved.revision} before restoring this shared view.`,
            );
          }
        }
        if (
          raw.level !== undefined &&
          !["all", "ground", "upper"].includes(raw.level)
        ) {
          throw new Error("Unknown floor.");
        }
        command = {
          id: crypto.randomUUID(),
          sourceSecond: raw.sourceSecond,
          objectId: raw.objectId,
          noteId: raw.noteId,
          level: raw.level,
          applied: false,
        };
        return json({
          ...command,
          instruction:
            "Queued for the open viewer. Check api/review/updates for applied=true; this does not edit geometry.",
        });
      }
      if (path === "/api/review/updates" && req.method === "GET") {
        const b = await load();
        return json({ command, revision: b.revision, revisions });
      }
      if (path === "/api/review/updates" && req.method === "POST") {
        const raw = await req.json();
        if (!command || command.id !== raw.id) {
          return json({ error: "View command was superseded." }, 409);
        }
        command.applied = true;
        return json({ applied: true });
      }
      if (path === "/api/review/notes" && req.method === "GET") {
        return json(await notes());
      }
      if (path === "/api/review/notes" && req.method === "POST") {
        return await serial(async () => {
          const raw = await req.json();
          const context = await validFocus(raw);
          if (
            typeof raw.text !== "string" || !raw.text.trim() ||
            raw.text.length > 12000
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
          const all = await notes();
          const note: ReviewNote = {
            ...context,
            id,
            number: all.length + 1,
            text: raw.text.trim(),
            strokes,
            createdAt: new Date().toISOString(),
            status: "open",
            screenshot: await image(raw.screenshot, `${id}-view`),
            attachment: await image(raw.attachment, `${id}-photo`),
          };
          all.push(note);
          await save(all);
          return json(note, 201);
        });
      }
      if (path === "/api/review/notes/status" && req.method === "POST") {
        return await serial(async () => {
          const body = await req.json();
          if (!["open", "resolved"].includes(body.status)) {
            throw new Error("Invalid status.");
          }
          const all = await notes();
          const note = all.find((n) => n.id === body.id);
          if (!note) return json({ error: "Note not found" }, 404);
          note.status = body.status;
          await save(all);
          return json(note);
        });
      }
      if (path.startsWith("/files/review-notes/") && req.method === "GET") {
        return await file(
          `${await notesDir()}/images`,
          path.slice("/files/review-notes/".length),
        );
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
