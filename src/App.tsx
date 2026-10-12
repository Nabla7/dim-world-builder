import { useCallback, useEffect, useState } from "react";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as api from "./api.ts";
import {
  Button,
  CodeBlock,
  Field,
  IconButton,
  List,
  ListRow,
  Modal,
  NumberInput,
  Progress,
  Segmented,
  Select,
  Tabs,
  Text,
  TextInput,
  toast,
  Toggle,
} from "./ui.ts";
import { emptyProject } from "./world/defaults.ts";
import { testCourse } from "./world/examples.ts";
import { clutterYard } from "./world/examples_clutter.ts";
import type { MeshAsset } from "./world/types.ts";
import { AddPanel, FloorsPanel, Inspector, ItemsPanel, NavPanel, ViewsPanel } from "./editor/Panels.tsx";
import { Viewport } from "./editor/Viewport.tsx";
import {
  addItem,
  duplicateItem,
  getState,
  loadProject,
  openMenu,
  redo,
  removeItem,
  renameKey,
  renameProject,
  select,
  setDrawingPath,
  setGizmo,
  setMode,
  setNavTool,
  setShowCollision,
  setSnap,
  undo,
  useEditor,
  useMenu,
} from "./editor/store.ts";
import { makeItem } from "./world/defaults.ts";
import { view } from "./editor/palette.ts";

type Tab = "add" | "floors" | "items" | "nav" | "views";

export function App() {
  const [assets, setAssets] = useState<MeshAsset[]>([]);
  const [tab, setTab] = useState<Tab>("add");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const mode = useEditor((s) => s.mode);
  const gizmo = useEditor((s) => s.gizmo);
  const snap = useEditor((s) => s.snap);
  const showCollision = useEditor((s) => s.showCollision);
  const project = useEditor((s) => s.project);
  const navTool = useEditor((s) => s.navTool);
  const revision = useEditor((s) => s.revision);
  const assetMap = useAssetMap(assets);

  const refreshAssets = useCallback(
    () =>
      api.library().then(setAssets).catch((e) =>
        toast({ title: "Library", message: String(e), tone: "danger" })
      ),
    [],
  );
  useEffect(() => {
    refreshAssets();
    // #example opens the test course (handy for demos); otherwise the last world worked on
    if (location.hash === "#example" || location.hash === "#clutter") {
      loadProject(location.hash === "#example" ? testCourse() : clutterYard());
      return;
    }
    const last = localStorageGet("dim-world-builder.project");
    if (last) api.loadProject(last).then(loadProject).catch(() => {});
  }, [refreshAssets]);

  // autosave: the project file in the app's data folder, a moment after the last change
  useEffect(() => {
    if (revision === 0) return;
    const timer = setTimeout(() => {
      api.saveProject(getState().project).catch(() => {});
      localStorageSet("dim-world-builder.project", getState().project.name);
    }, 800);
    return () => clearTimeout(timer);
  }, [revision]);

  useKeyboard();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <TextInput
          value={project.name}
          onChange={renameProject}
          aria-label="World name"
          style={{ maxWidth: 240 }}
          data-testid="world-name"
        />
        <ProjectMenu />
        <div style={{ flex: 1 }} />
        <Segmented
          value={mode}
          items={[{ value: "edit", label: "Edit" }, { value: "view", label: "Viewer" }]}
          onChange={(m: string) => setMode(m as "edit" | "view")}
          data-testid="mode"
        />
        <Button
          variant="primary"
          icon="download"
          onClick={() => setExporting(true)}
          data-testid="export"
        >
          Export
        </Button>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {mode === "edit" && (
          <aside
            style={{
              width: 330,
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              background: "var(--surface)",
            }}
          >
            <Tabs
              value={tab}
              onChange={(t: string) => setTab(t as Tab)}
              items={[
                { value: "add", label: "Add" },
                { value: "floors", label: "Floors" },
                { value: "items", label: "Items" },
                { value: "nav", label: "Nav test" },
                { value: "views", label: "Views" },
              ]}
              style={{ padding: "0 8px" }}
            />
            <div
              style={{ flex: 1, overflow: "auto", paddingBottom: "var(--dim-inset-bottom, 0px)" }}
              data-testid="sidebar"
            >
              {tab === "add" && <AddPanel assets={assets} onImport={() => setImporting(true)} />}
              {tab === "floors" && <FloorsPanel />}
              {tab === "items" && <ItemsPanel />}
              {tab === "nav" && <NavPanel />}
              {tab === "views" && <ViewsPanel />}
            </div>
          </aside>
        )}
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <Viewport assets={assetMap} />
          {mode === "edit"
            ? (
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  display: "flex",
                  gap: 8,
                  padding: 6,
                  borderRadius: "var(--radius)",
                  background: "var(--panel, var(--raised))",
                  boxShadow: "var(--shadow)",
                }}
              >
                <Segmented
                  size="sm"
                  value={gizmo}
                  items={[
                    { value: "translate", label: "Move (W)" },
                    { value: "rotate", label: "Rotate (E)" },
                    { value: "scale", label: "Scale (R)" },
                  ]}
                  onChange={(g: string) => setGizmo(g as "translate")}
                  data-testid="gizmo"
                />
                <Toggle size="sm" value={snap} onChange={setSnap} label="Snap" />
                <Toggle
                  size="sm"
                  value={showCollision}
                  onChange={setShowCollision}
                  label="Collision"
                  data-testid="show-collision"
                />
                {navTool === "tag" && (
                  <Button
                    size="sm"
                    icon="close"
                    onClick={() => setNavTool(null)}
                    data-testid="tag-tool-done"
                  >
                    Placing AprilTags: click a wall · Done
                  </Button>
                )}
                <IconButton icon="rotate-left" label="Undo" size="sm" onClick={undo} />
                <IconButton icon="rotate-right" label="Redo" size="sm" onClick={redo} />
              </div>
            )
            : <ViewerOverlay />}
        </main>
        {mode === "edit" && (
          <aside
            style={{
              width: 320,
              borderLeft: "1px solid var(--border)",
              overflow: "auto",
              background: "var(--surface)",
              paddingBottom: "var(--dim-inset-bottom, 0px)",
            }}
          >
            <Inspector assets={assets} />
          </aside>
        )}
      </div>
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onCooked={async (asset) => {
          await refreshAssets();
          setShowCollision(true);
          addItem(makeItem("mesh", { source: "import", asset: asset.id }, {
            name: asset.name,
            floor: getState().project.activeFloor,
            position: [view.center[0], view.center[1], 0],
          }));
        }}
      />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
      <ItemMenu />
    </div>
  );
}

function useAssetMap(assets: MeshAsset[]) {
  const [map, setMap] = useState<Record<string, MeshAsset>>({});
  useEffect(() => setMap(Object.fromEntries(assets.map((a) => [a.id, a]))), [assets]);
  return map;
}

function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window
  }
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const selected = getState().selected;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        (e.shiftKey ? redo : undo)();
      } else if (mod && e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        duplicateItem(selected);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        removeItem(selected);
      } else if (e.key === "Escape") {
        if (getState().navTool) setNavTool(null);
        else if (getState().drawingPath) setDrawingPath(null);
        else select(null);
      } else if (!mod && getState().mode === "edit") {
        const key = e.key.toLowerCase();
        if (key === "w") setGizmo("translate");
        if (key === "e") setGizmo("rotate");
        if (key === "r") setGizmo("scale");
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

function ProjectMenu() {
  const [projects, setProjects] = useState<string[]>([]);
  const refresh = () => api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);
  const choices = [
    { value: "", label: "Open…" },
    { value: "new", label: "New empty world" },
    { value: "example", label: "Example: nav test course" },
    { value: "clutter", label: "Example: cluttered yard" },
    ...projects.map((p) => ({ value: `project:${p}`, label: p, group: "Saved" })),
  ];
  return (
    <Select
      size="sm"
      value=""
      style={{ width: 220 }}
      options={choices}
      onFocus={refresh}
      aria-label="Open a world"
      data-testid="open-world"
      onChange={(choice: string) => {
        if (choice === "new") {
          loadProject(
            emptyProject(`world_${new Date().toISOString().slice(5, 10).replace("-", "")}`),
          );
        } else if (choice === "example") loadProject(testCourse());
        else if (choice === "clutter") loadProject(clutterYard());
        else if (choice.startsWith("project:")) api.loadProject(choice.slice(8)).then(loadProject);
      }}
    />
  );
}

function ImportDialog(
  { open, onClose, onCooked }: {
    open: boolean;
    onClose: () => void;
    onCooked: (a: MeshAsset) => void;
  },
) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [height, setHeight] = useState<number | null>(null);
  const [job, setJob] = useState<api.CookJob | null>(null);
  useEffect(() => {
    if (!job || job.state !== "running") return;
    const timer = setTimeout(() => api.importStatus(job.id).then(setJob), 400);
    return () => clearTimeout(timer);
  }, [job]);
  useEffect(() => {
    if (job?.state === "done" && job.asset) {
      onCooked(job.asset);
      toast({
        title: "Cooked",
        message: `${job.name}: ${job.asset.hulls.length} convex collision pieces`,
        tone: "ok",
      });
    }
  }, [job?.state]);
  const close = () => {
    setJob(null);
    setFile(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Import a 3D model"
      footer={job?.state === "done"
        ? <Button variant="primary" onClick={close}>Done</Button>
        : (
          <Button
            variant="primary"
            icon="zap"
            disabled={!file || job?.state === "running"}
            loading={job?.state === "running"}
            data-testid="cook"
            onClick={async () => {
              if (!file) return;
              const { job: id } = await api.startImport(
                file,
                name || file.name.replace(/\.[^.]+$/, ""),
                height,
              );
              setJob({ id, name, state: "running", stage: "uploading", progress: 0, log: [] });
            }}
          >
            Cook it
          </Button>
        )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Text small muted>
          A .glb, .gltf or .obj. Cooking turns it Z-up, sits it on the floor, splits its look by
          color for MuJoCo, and breaks it into convex pieces (CoACD) so the robot collides with its
          real shape.
        </Text>
        <input
          type="file"
          accept=".glb,.gltf,.obj"
          data-testid="import-file"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            if (chosen && !name) setName(chosen.name.replace(/\.[^.]+$/, ""));
          }}
        />
        <Field label="Name">
          <TextInput value={name} onChange={setName} data-testid="import-name" />
        </Field>
        <Field label="Height" hint="leave empty to keep the model's own size">
          <NumberInput
            nullable
            value={height}
            step={0.1}
            unit="m"
            placeholder="as authored"
            onChange={setHeight}
          />
        </Field>
        {job && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
            data-testid="cook-progress"
          >
            <Progress value={job.progress} />
            <Text small tone={job.state === "failed" ? "danger" : undefined}>{job.stage}</Text>
            {job.state !== "done" && job.log.length > 0 && (
              <CodeBlock code={job.log.slice(-6).join("\n")} language="sh" />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** the world as one GLB (what the editor draws, Z up like the scene), for viewers that want one visual file */
async function bakeVisual(): Promise<ArrayBuffer | null> {
  if (!view.worldRoot) return null;
  const result = await new GLTFExporter().parseAsync(view.worldRoot, {
    binary: true,
    onlyVisible: true,
  });
  return result as ArrayBuffer;
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const [parent, setParent] = useState("~/dimos_worlds");
  const [listing, setListing] = useState<api.DirListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<api.ExportResult | null>(null);
  const packageName = project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(
    /^_+|_+$/g,
    "",
  );
  useEffect(() => {
    if (open) api.listDirs(parent).then(setListing).catch(() => setListing(null));
  }, [open, parent]);
  const close = () => {
    setResult(null);
    onClose();
  };
  const run = result
    ? `dimos --simulation mujoco --transport zenoh --scene-package ${result.dir} run unitree-go2-freewalk`
    : "";
  return (
    <Modal
      open={open}
      onClose={close}
      title="Export for dimos"
      size="lg"
      footer={result ? <Button variant="primary" onClick={close}>Done</Button> : (
        <Button
          variant="primary"
          icon="download"
          loading={busy}
          data-testid="export-go"
          onClick={async () => {
            setBusy(true);
            try {
              const exported = await api.exportWorld(project, parent);
              const glb = await bakeVisual().catch(() => null);
              if (glb) await api.uploadVisual(exported.dir, glb);
              setResult({
                ...exported,
                files: glb ? [...exported.files, "visual.glb"] : exported.files,
              });
            } catch (error) {
              toast({ title: "Export failed", message: String(error), tone: "danger" });
            } finally {
              setBusy(false);
            }
          }}
        >
          Export {packageName || "world"}
        </Button>
      )}
    >
      {result
        ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
            data-testid="export-result"
          >
            <Text>
              Wrote <b>{result.dir}</b>: {result.bodies} bodies, {result.movers} moving,{" "}
              {result.files.length} files.
            </Text>
            <Field label="Run a simulated Go2 in it">
              <CodeBlock code={run} language="sh" />
            </Field>
            <Field label="Or from Python">
              <CodeBlock
                language="py"
                code={`import sys; sys.path.insert(0, "${
                  result.dir.replace(/\/[^/]+$/, "")
                }")\nimport ${result.name}\n${result.name}.check()  # compiles scene.xml with MuJoCo`}
              />
            </Field>
            <List divided>
              {result.files.filter((f) => !f.startsWith("meshes/")).map((f) => (
                <ListRow key={f} icon="file" title={f} />
              ))}
              <ListRow
                icon="folder"
                title="meshes/"
                subtitle={`${result.files.filter((f) => f.startsWith("meshes/")).length} files`}
              />
            </List>
          </div>
        )
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Name" hint={`the folder and the Python package: ${packageName}`}>
              <TextInput value={project.name} onChange={renameProject} data-testid="export-name" />
            </Field>
            <Field label="Into the folder">
              <TextInput value={parent} onChange={setParent} mono data-testid="export-parent" />
            </Field>
            {listing && (
              <div
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <List divided>
                  <ListRow icon="arrow-up" title=".." onClick={() => setParent(listing.parent)} />
                  {listing.dirs.map((d) => (
                    <ListRow
                      key={d}
                      icon="folder"
                      title={d}
                      onClick={() => setParent(`${listing.path.replace(/\/$/, "")}/${d}`)}
                    />
                  ))}
                </List>
              </div>
            )}
            <Text small muted>
              Writes{" "}
              {packageName}/ with scene.xml (MuJoCo), scene.json (entities, spawns), movers.json,
              __init__.py, meshes/ and the project file, which re-opens here.
            </Text>
          </div>
        )}
    </Modal>
  );
}

/** viewer mode: how to start a run, and what's on */
function ViewerOverlay() {
  const showCollision = useEditor((s) => s.showCollision);
  const name = useEditor((s) => s.project.name);
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: "var(--radius)",
        background: "var(--panel, var(--raised))",
        boxShadow: "var(--shadow)",
      }}
      data-testid="viewer-overlay"
    >
      <Text small>
        Live view of a running simulation of this world: the robot and the moving objects follow the
        blueprint's TF.
      </Text>
      <CodeBlock
        code={`dimos --simulation mujoco --transport zenoh --scene-package ~/dimos_worlds/${name} run unitree-go2-freewalk`}
        language="sh"
      />
      <Toggle
        size="sm"
        value={showCollision}
        onChange={setShowCollision}
        label="Show the robot's lidar"
      />
    </div>
  );
}

/** right-click on an item: its readable id (renamable), and focus / duplicate / remove */
function ItemMenu() {
  const menu = useMenu();
  const item = useEditor((s) => s.project.items.find((i) => i.id === menu?.itemId) ?? null);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setDraft(item?.key ?? "");
    setProblem(null);
  }, [menu?.itemId]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-testid=item-menu]")) openMenu(null);
    };
    addEventListener("pointerdown", close, true);
    return () => removeEventListener("pointerdown", close, true);
  }, [menu]);
  if (!menu || !item) return null;
  const rename = () => {
    const error = renameKey(item.id, draft);
    setProblem(error);
    if (!error) openMenu(null);
  };
  return (
    <div
      data-testid="item-menu"
      style={{
        position: "fixed",
        left: Math.min(menu.x, innerWidth - 260),
        top: Math.min(menu.y, innerHeight - 220),
        width: 240,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: "var(--radius)",
        background: "var(--raised)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <Text small muted>{item.name}</Text>
      <Field label="Id (the entity name in the exported scene)">
        <TextInput
          value={draft}
          onChange={setDraft}
          onEnter={rename}
          mono
          autoFocus
          data-testid="item-key"
          invalid={Boolean(problem)}
        />
      </Field>
      {problem && <Text small tone="danger">{problem}</Text>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button size="sm" variant="primary" onClick={rename}>Rename</Button>
        <Button
          size="sm"
          icon="target"
          onClick={() => {
            (globalThis as unknown as { dimWorldBuilder: { focus(k: string): void } })
              .dimWorldBuilder.focus(
                item.key ?? "",
              );
            openMenu(null);
          }}
        >
          Focus
        </Button>
        <Button size="sm" icon="copy" onClick={() => (duplicateItem(item.id), openMenu(null))}>
          Duplicate
        </Button>
        <Button
          size="sm"
          icon="trash"
          variant="danger"
          onClick={() => (removeItem(item.id), openMenu(null))}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
