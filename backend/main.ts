// dimos-app-server for dim-world-builder: serves the built page and the app's API on the unix socket Desktop gives.
//
// What Desktop passes: one env var, DIMOS_APP (JSON): { name, socket, dataDir, desktopUrl, ... }. Requests arrive with
// /apps/<name> already removed.
//
// The API, as dimos.yaml declares it:
//   POST /api/export                 public: write a project as a dimos world directory (body: { project, parentDir })
//   GET  /api/library                public: every placeable mesh asset (library + cooked imports)
//   GET  /api/projects               public: saved projects
//   GET|PUT /api/internal/projects/<name>   private: load / autosave one project
//   POST /api/internal/import?name=&height=  private: upload a .glb/.gltf/.obj; cooks it in the background
//   GET  /api/internal/import/<job>  private: a cook's progress and result
//   POST /api/internal/visual?dir=   private: the page's baked visual.glb for an export
//   GET  /api/internal/dirs?path=    private: folders under a path (the export folder picker)
//   GET  /files/library/<id>/<file>, /files/imports/<id>/<file>   private: mesh files

import { exportProject, packageName } from "./export.ts";
import type { Item, MeshAsset, Project } from "../src/world/types.ts";
import { emptyProject } from "../src/world/defaults.ts";
import { testCourse } from "../src/world/examples.ts";
import { clutterYard } from "../src/world/examples_clutter.ts";
import { playground } from "../src/world/examples_playground.ts";
import { keyedProject } from "../src/world/keys.ts";

const app = JSON.parse(Deno.env.get("DIMOS_APP") ?? "{}") as {
  name?: string;
  socket?: string;
  dataDir?: string;
  desktopUrl?: string;
};
const flag = (name: string) => {
  const index = Deno.args.indexOf(`--${name}`);
  return index === -1 ? undefined : Deno.args[index + 1];
};
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const frontend = flag("frontend") ?? `${root}/dist`;
const dataDir = app.dataDir ?? `${root}/.data`;
const libraryDir = `${root}/assets/library`;
const importsDir = `${dataDir}/imports`;
const projectsDir = `${dataDir}/projects`;
const cookerDir = `${root}/cooker`;
const home = Deno.env.get("HOME") ?? "/";
const desktopUrl = app.desktopUrl ?? "http://127.0.0.1:5555";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T;
  } catch {
    return fallback;
  }
}

/** library assets ship with the app; imports are cooked into dataDir. `base` is the page's URL for their files. */
async function assets(): Promise<{ list: MeshAsset[]; dirs: Record<string, string> }> {
  const list: MeshAsset[] = [];
  const dirs: Record<string, string> = {};
  for (const asset of await readJson<MeshAsset[]>(`${libraryDir}/index.json`, [])) {
    list.push({ ...asset, base: `files/library/${asset.id}` });
    dirs[asset.id] = `${libraryDir}/${asset.id}`;
  }
  try {
    for await (const entry of Deno.readDir(importsDir)) {
      if (!entry.isDirectory) continue;
      const meta = await readJson<MeshAsset | null>(`${importsDir}/${entry.name}/meta.json`, null);
      if (!meta) continue;
      list.push({
        ...meta,
        id: entry.name,
        category: "imported",
        base: `files/imports/${entry.name}`,
      });
      dirs[entry.name] = `${importsDir}/${entry.name}`;
    }
  } catch {
    // no imports yet
  }
  return { list, dirs };
}

// ── cooking an upload: the app's own Python (cooker/, uv-locked), one job at a time per upload ──

interface CookJob {
  id: string;
  name: string;
  state: "running" | "done" | "failed";
  stage: string;
  progress: number;
  log: string[];
  asset?: MeshAsset;
}
const jobs = new Map<string, CookJob>();

function uvBinary(): string {
  return flag("uv") ?? Deno.env.get("DIM_WORLD_BUILDER_UV") ?? "uv";
}

async function cook(job: CookJob, input: string, targetHeight: number | null) {
  const out = `${importsDir}/${job.id}`;
  const args = [
    "run",
    "--frozen",
    "--project",
    cookerDir,
    "python",
    `${cookerDir}/cook.py`,
    input,
    out,
    "--id",
    job.id,
    "--name",
    job.name,
    "--category",
    "imported",
    "--validate",
    "--thumb",
  ];
  if (targetHeight) args.push("--target-height", String(targetHeight));
  const command = new Deno.Command(uvBinary(), {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { UV_PROJECT_ENVIRONMENT: `${dataDir}/cooker-venv`, PYTHONUNBUFFERED: "1" },
  });
  const child = command.spawn();
  const decoder = new TextDecoder();
  const read = async (stream: ReadableStream<Uint8Array>) => {
    let buffer = "";
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        job.log.push(line);
        try {
          const event = JSON.parse(line);
          if (event.stage) job.stage = event.stage;
          if (typeof event.progress === "number") job.progress = event.progress;
        } catch {
          // a plain log line (uv installing the environment, warnings)
        }
      }
    }
  };
  await Promise.all([read(child.stdout), read(child.stderr)]);
  const status = await child.status;
  await Deno.remove(input).catch(() => {});
  if (status.success) {
    const meta = await readJson<MeshAsset | null>(`${out}/meta.json`, null);
    job.asset = meta
      ? { ...meta, id: job.id, category: "imported", base: `files/imports/${job.id}` }
      : undefined;
    job.state = job.asset ? "done" : "failed";
    job.stage = job.asset ? "cooked" : "no meta.json written";
    job.progress = 1;
  } else {
    job.state = "failed";
    job.stage = status.code === 2 ? "quality check failed" : `cooker exited ${status.code}`;
    await Deno.remove(out, { recursive: true }).catch(() => {});
  }
}

// ── routes ──

const safeName = (name: string) => packageName(decodeURIComponent(name));

async function saveProject(unkeyed: Project) {
  const project = keyedProject(unkeyed);
  await Deno.mkdir(projectsDir, { recursive: true });
  await Deno.writeTextFile(
    `${projectsDir}/${packageName(project.name)}.json`,
    JSON.stringify(project, null, 2),
  );
}

/** fill in what a caller may leave out of an item: an id, a name, the floor, a pose */
function completeItem(item: Partial<Item>, floor: string): Item {
  return {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    name: item.name ?? item.kind ?? "item",
    floor: item.floor ?? floor,
    position: item.position ?? [0, 0, 0],
    rotation: item.rotation ?? [0, 0, 0, 1],
    scale: item.scale ?? [1, 1, 1],
    ...item,
  } as Item;
}

async function api(request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const route = `${request.method} ${path}`;
  if (route === "GET /api/library") {
    return json((await assets()).list);
  }
  if (route === "GET /api/projects") {
    const names: string[] = [];
    try {
      for await (const entry of Deno.readDir(projectsDir)) {
        if (entry.name.endsWith(".json")) names.push(entry.name.replace(/\.json$/, ""));
      }
    } catch {
      // none yet
    }
    return json({ projects: names.sort() });
  }
  if (path.startsWith("/api/internal/projects/")) {
    const file = `${projectsDir}/${safeName(path.slice("/api/internal/projects/".length))}.json`;
    if (request.method === "GET") {
      const project = await readJson<Project | null>(file, null);
      return project ? json(project) : json({ error: "no such project" }, 404);
    }
    if (request.method === "PUT") {
      await Deno.mkdir(projectsDir, { recursive: true });
      await Deno.writeTextFile(file, JSON.stringify(await request.json(), null, 2));
      return json({ saved: file });
    }
  }
  if (route === "GET /api/project") {
    const project = await readJson<Project | null>(
      `${projectsDir}/${safeName(url.searchParams.get("name") ?? "")}.json`,
      null,
    );
    return project ? json(project) : json({ error: "no such project" }, 404);
  }
  if (route === "POST /api/project") {
    const { project } = await request.json() as { project: Project };
    if (project?.format !== "dim-world-builder.project.v1") {
      return json({ error: "expected { project } in dim-world-builder.project.v1 format" }, 400);
    }
    await saveProject(project);
    return json({ saved: packageName(project.name), items: project.items.length });
  }
  if (route === "POST /api/project/items") {
    // add items (each a partial item: kind, params, name, position, ...) to a saved project
    const { name, items } = await request.json() as { name: string; items: Partial<Item>[] };
    const file = `${projectsDir}/${safeName(name)}.json`;
    const project = await readJson<Project | null>(file, null);
    if (!project) return json({ error: `no project ${name}` }, 404);
    const added = (items ?? []).map((item) => completeItem(item, project.activeFloor));
    project.items.push(...added);
    await saveProject(project);
    return json({ added: added.map((i) => i.id), items: project.items.length });
  }
  if (route === "POST /api/generate") {
    const { kind, name, seed } = await request.json() as {
      kind: string;
      name?: string;
      seed?: number;
    };
    const library = (await assets()).list;
    const generators: Record<string, () => Project> = {
      playground: () => playground(library, seed ?? 7),
      test_course: () => testCourse(),
      clutter_yard: () => clutterYard(),
      empty: () => emptyProject(name ?? "untitled_world"),
    };
    const make = generators[kind];
    if (!make) {
      return json({ error: `kind must be one of ${Object.keys(generators).join(", ")}` }, 400);
    }
    const project = make();
    if (name) project.name = name;
    await saveProject(project);
    return json({ saved: packageName(project.name), items: project.items.length });
  }
  if (route === "POST /api/export") {
    const body = await request.json() as { project?: Project; name?: string; parentDir?: string };
    const project = body.project ??
      await readJson<Project | null>(`${projectsDir}/${safeName(body.name ?? "")}.json`, null);
    if (!project) return json({ error: "give { project } or the { name } of a saved one" }, 400);
    const parentDir = body.parentDir;
    const parent = (parentDir || `${home}/dimos_worlds`).replace(/^~(?=$|\/)/, home);
    const { list, dirs } = await assets();
    const result = await exportProject(
      project,
      Object.fromEntries(list.map((a) => [a.id, a])),
      dirs,
      parent,
    );
    await Deno.mkdir(projectsDir, { recursive: true });
    await Deno.writeTextFile(
      `${projectsDir}/${result.name}.json`,
      JSON.stringify(project, null, 2),
    );
    return json(result);
  }
  if (route === "POST /api/internal/visual") {
    const dir = url.searchParams.get("dir") ?? "";
    await Deno.stat(`${dir}/scene.xml`); // only into a folder this app exported
    await Deno.writeFile(`${dir}/visual.glb`, new Uint8Array(await request.arrayBuffer()));
    return json({ written: `${dir}/visual.glb` });
  }
  if (route === "GET /api/internal/dirs") {
    const requested = (url.searchParams.get("path") || home).replace(/^~(?=$|\/)/, home);
    const dirs: string[] = [];
    try {
      for await (const entry of Deno.readDir(requested)) {
        if (entry.isDirectory && !entry.name.startsWith(".")) dirs.push(entry.name);
      }
    } catch (error) {
      return json({ path: requested, error: String(error), dirs: [] });
    }
    const parent = requested.replace(/\/[^/]+\/?$/, "") || "/";
    return json({ path: requested, parent, home, dirs: dirs.sort() });
  }
  if (route === "POST /api/internal/import") {
    const name = url.searchParams.get("name") || "imported";
    const extension = (url.searchParams.get("ext") || "glb").replace(/[^a-z]/g, "");
    const height = Number(url.searchParams.get("height")) || null;
    const id = `${packageName(name).slice(0, 24)}_${crypto.randomUUID().slice(0, 6)}`;
    await Deno.mkdir(`${dataDir}/uploads`, { recursive: true });
    const input = `${dataDir}/uploads/${id}.${extension}`;
    await Deno.writeFile(input, new Uint8Array(await request.arrayBuffer()));
    const job: CookJob = { id, name, state: "running", stage: "starting", progress: 0, log: [] };
    jobs.set(id, job);
    cook(job, input, height).catch((error) => {
      job.state = "failed";
      job.stage = String(error);
    });
    return json({ job: id });
  }
  if (request.method === "GET" && path.startsWith("/api/internal/import/")) {
    const job = jobs.get(path.slice("/api/internal/import/".length));
    return job ? json({ ...job, log: job.log.slice(-12) }) : json({ error: "no such job" }, 404);
  }
  return path.startsWith("/api/") ? json({ error: `no ${route}` }, 404) : null;
}

// ── files: the page (vite's build) and mesh assets ──

const types: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  json: "application/json",
  png: "image/png",
  glb: "model/gltf-binary",
  obj: "text/plain",
  woff2: "font/woff2",
};

async function file(dir: string, path: string): Promise<Response> {
  const clean = path.split("/").filter((part) => part && part !== "..").join("/") || "index.html";
  try {
    const handle = await Deno.open(`${dir}/${clean}`);
    return new Response(handle.readable, {
      headers: {
        "content-type": types[clean.split(".").pop() ?? ""] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    const answer = await api(request, url);
    if (answer) return answer;
    if (path.startsWith("/files/library/")) {
      return await file(libraryDir, path.slice("/files/library/".length));
    }
    if (path.startsWith("/files/imports/")) {
      return await file(importsDir, path.slice("/files/imports/".length));
    }
    if (path.startsWith("/files/apriltags/")) {
      return await file(`${root}/assets/apriltags`, path.slice("/files/apriltags/".length));
    }
    if (path.startsWith("/files/robots/")) {
      return await file(`${root}/assets/robots`, path.slice("/files/robots/".length));
    }
    return await file(frontend, path);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  Deno.addSignalListener(signal, () => Deno.exit(0));
}

if (app.socket) {
  try {
    Deno.removeSync(app.socket);
  } catch {
    // not there
  }
  Deno.serve({
    path: app.socket,
    transport: "unix",
    onListen: () => console.error(`listening on ${app.socket}`),
  }, serve);
} else {
  // outside Desktop: `deno task serve` serves on a port (http://localhost:8787/)
  Deno.serve({ port: Number(flag("port") ?? 8787) }, serve);
}

export { desktopUrl };
