// The editor's state: the project (with undo), the selection, the tool. A tiny external store so the 3D view (outside
// React's render) and the panels read the same thing.

import { useSyncExternalStore } from "react";
import { emptyProject } from "../world/defaults.ts";
import type { CameraView, Floor, Item, MoverPath, NavPlan, Project, Vec3 } from "../world/types.ts";
import { keyedProject, slug, withKeys, withViewKeys } from "../world/keys.ts";

export type Gizmo = "translate" | "rotate" | "scale";
export type Mode = "edit" | "view";

export interface EditorState {
  project: Project;
  selected: string | null;
  gizmo: Gizmo;
  mode: Mode;
  snap: boolean;
  showCollision: boolean;
  /** instanced grass on hills (visual only; off for heavy scenes) */
  grass: boolean;
  /** play the moving objects along their paths in the editor, as the simulation will */
  previewMotion: boolean;
  /** the item whose mover path clicks on the ground extend */
  drawingPath: string | null;
  /** clicks on the ground extend the nav test's mapping path, or add a goal */
  navTool: "path" | "goal" | "tag" | null;
  past: Project[];
  future: Project[];
  /** the last time the project changed, for autosave */
  revision: number;
  /** counts opened projects (not edits), so the view frames each newly opened world once */
  opened: number;
}

let state: EditorState = {
  project: emptyProject(),
  selected: null,
  gizmo: "translate",
  mode: "edit",
  snap: true,
  showCollision: false,
  grass: true,
  previewMotion: false,
  drawingPath: null,
  navTool: null,
  past: [],
  future: [],
  revision: 0,
  opened: 0,
};
const listeners = new Set<() => void>();

export function getState(): EditorState {
  return state;
}

function set(next: Partial<EditorState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditor<T>(pick: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state));
}

// ── project edits (each one undoable; `coalesce` merges a drag's many updates into one undo step) ──

let coalesceKey: string | null = null;

export function edit(change: (project: Project) => Project, coalesce?: string) {
  const next = change(state.project);
  if (next === state.project) return;
  const past = coalesce && coalesce === coalesceKey
    ? state.past
    : [...state.past.slice(-99), state.project];
  coalesceKey = coalesce ?? null;
  set({ project: next, past, future: [], revision: state.revision + 1 });
}

export function undo() {
  const previous = state.past.at(-1);
  if (!previous) return;
  coalesceKey = null;
  set({
    project: previous,
    past: state.past.slice(0, -1),
    future: [state.project, ...state.future],
    revision: state.revision + 1,
  });
}

export function redo() {
  const next = state.future[0];
  if (!next) return;
  coalesceKey = null;
  set({
    project: next,
    past: [...state.past, state.project],
    future: state.future.slice(1),
    revision: state.revision + 1,
  });
}

export function loadProject(loaded: Project) {
  coalesceKey = null;
  const project = keyedProject(loaded);
  set({
    project,
    selected: null,
    past: [],
    future: [],
    drawingPath: null,
    revision: state.revision + 1,
  });
}

export const select = (selected: string | null) =>
  set({ selected, drawingPath: null, navTool: null });
export const setNavTool = (navTool: "path" | "goal" | "tag" | null) =>
  set({ navTool, drawingPath: null, selected: navTool ? null : state.selected });
export const setGizmo = (gizmo: Gizmo) => set({ gizmo });
export const setMode = (mode: Mode) => set({ mode, drawingPath: null });
export const setSnap = (snap: boolean) => set({ snap });
export const setShowCollision = (showCollision: boolean) => set({ showCollision });
export const setGrass = (grass: boolean) => set({ grass });
export const setPreviewMotion = (previewMotion: boolean) => set({ previewMotion });
export const setDrawingPath = (drawingPath: string | null) => set({ drawingPath, navTool: null });

export function selectedItem(): Item | null {
  return state.project.items.find((i) => i.id === state.selected) ?? null;
}

export function addItem(item: Item) {
  edit((p) => ({ ...p, items: [...p.items, ...withKeys([item], p.items)] }));
  set({ selected: item.id });
}

export function addItems(items: Item[]) {
  edit((p) => ({ ...p, items: [...p.items, ...withKeys(items, p.items)] }));
  set({ selected: null });
}

/** rename an item's readable id; refuses one another item already has. Returns the error, if any. */
export function renameKey(id: string, wanted: string): string | null {
  const key = slug(wanted);
  if (state.project.items.some((i) => i.id !== id && i.key === key)) return `${key} is taken`;
  updateItem(id, (item) => ({ ...item, key }));
  return null;
}

export function updateItem(id: string, change: (item: Item) => Item, coalesce?: string) {
  edit((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? change(i) : i)) }), coalesce);
}

export function removeItem(id: string) {
  edit((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) }));
  if (state.selected === id) set({ selected: null, drawingPath: null });
}

export function duplicateItem(id: string) {
  const item = state.project.items.find((i) => i.id === id);
  if (!item) return;
  const copy = structuredClone(item);
  copy.id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  copy.name = `${item.name} copy`;
  delete copy.key;
  copy.position = [item.position[0] + 0.5, item.position[1] + 0.5, item.position[2]] as Vec3;
  addItem(copy);
}

export function setMover(id: string, mover: MoverPath | undefined) {
  updateItem(id, (item) => ({ ...item, mover }));
}

// ── floors ──

export function setActiveFloor(floor: string) {
  edit((p) => ({ ...p, activeFloor: floor }), "active-floor");
  const item = selectedItem();
  if (item && item.floor !== floor) set({ selected: null });
}

/**
 * A new floor 3 m over the top one, with a slab to stand on (without one, what's added to it floats in the air): over
 * the top floor's items and a meter around them, or 8 m square around `around` when that floor is empty.
 */
export function addFloor(around: Vec3 = [0, 0, 0]) {
  edit((p) => {
    const topFloor = p.floors.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    const id = `floor_${crypto.randomUUID().slice(0, 6)}`;
    const below = p.items.filter((i) =>
      i.floor === topFloor.id && !["light", "hill"].includes(i.kind)
    );
    let [x0, y0, x1, y1] = [around[0] - 4, around[1] - 4, around[0] + 4, around[1] + 4];
    if (below.length) {
      [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const item of below) {
        const half = item.kind === "room"
          ? Math.max(item.params.width, item.params.depth) / 2
          : 0.5;
        x0 = Math.min(x0, item.position[0] - half - 1);
        y0 = Math.min(y0, item.position[1] - half - 1);
        x1 = Math.max(x1, item.position[0] + half + 1);
        y1 = Math.max(y1, item.position[1] + half + 1);
      }
    }
    const round = (v: number) => Math.round(v * 10) / 10;
    const floor: Floor = {
      id,
      name: `Floor ${p.floors.length + 1}`,
      elevation: topFloor.elevation + 3,
      slab: {
        thickness: 0.2,
        sizeX: round(Math.max(6, x1 - x0)),
        sizeY: round(Math.max(6, y1 - y0)),
        center: [round((x0 + x1) / 2), round((y0 + y1) / 2)],
      },
    };
    return { ...p, floors: [...p.floors, floor], activeFloor: id };
  });
}

export function removeFloor(id: string) {
  edit((p) => {
    if (p.floors.length <= 1) return p;
    const floors = p.floors.filter((f) => f.id !== id);
    return {
      ...p,
      floors,
      items: p.items.filter((i) => i.floor !== id),
      spawns: p.spawns.filter((s) => s.floor !== id),
      activeFloor: p.activeFloor === id ? floors[0].id : p.activeFloor,
    };
  });
}

export function updateFloor(id: string, change: Partial<Floor>) {
  edit(
    (p) => ({ ...p, floors: p.floors.map((f) => (f.id === id ? { ...f, ...change } : f)) }),
    `floor-${id}`,
  );
}

export function renameProject(name: string) {
  edit((p) => ({ ...p, name }), "name");
}

// ── the navigation test ──

function navPlan(p: Project): NavPlan {
  return p.nav ??
    {
      startSpawn: p.spawns[0]?.name ?? "default",
      floor: p.activeFloor,
      mappingPath: [],
      goals: [],
    };
}

/** remembers a camera view; its key comes from the name (unique among the world's views); returns the key */
export function saveView(camera: Omit<CameraView, "key" | "name">, name?: string): string {
  const views = state.project.views ?? [];
  let n = views.length + 1;
  while (views.some((v) => v.name === `View ${n}`)) n++;
  const [added] = withViewKeys([...views, { key: "", name: name ?? `View ${n}`, ...camera }]).slice(
    -1,
  );
  edit((p) => ({ ...p, views: [...(p.views ?? []), added] }));
  return added.key;
}

/** renames a view and re-derives its key from the new name, unless that key is taken */
export function renameView(key: string, name: string): string | null {
  const wanted = slug(name).replace(/^item_/, "view_");
  const views = state.project.views ?? [];
  if (views.some((v) => v.key !== key && v.key === wanted)) return `${wanted} is taken`;
  edit((p) => ({
    ...p,
    views: (p.views ?? []).map((v) => (v.key === key ? { ...v, name, key: wanted } : v)),
  }), `view-name-${key}`);
  return null;
}

/** points a view at where the camera is now */
export function updateView(key: string, camera: Omit<CameraView, "key" | "name">) {
  edit((p) => ({
    ...p,
    views: (p.views ?? []).map((v) => (v.key === key ? { ...v, ...camera } : v)),
  }));
}

export function removeView(key: string) {
  edit((p) => ({ ...p, views: (p.views ?? []).filter((v) => v.key !== key) }));
}

export function updateNav(change: (nav: NavPlan) => NavPlan, coalesce?: string) {
  edit((p) => ({ ...p, nav: change(navPlan(p)) }), coalesce);
}

/** a click on the ground while a nav tool is on */
export function addNavPoint(point: Vec3) {
  const tool = state.navTool;
  const floor = state.project.activeFloor;
  if (tool === "path") {
    updateNav((nav) => ({
      ...nav,
      floor: nav.mappingPath.length ? nav.floor : floor,
      mappingPath: [...nav.mappingPath, point],
    }));
  } else if (tool === "goal") {
    updateNav((nav) => ({
      ...nav,
      goals: [...nav.goals, {
        id: crypto.randomUUID().slice(0, 8),
        name: `Goal ${nav.goals.length + 1}`,
        floor,
        position: point,
        tolerance: 0.5,
        timeout: 120,
      }],
    }));
  }
}

// ── a right-click menu on an item ──

export interface ContextMenuState {
  x: number;
  y: number;
  itemId: string;
}
let menu: ContextMenuState | null = null;
const menuListeners = new Set<() => void>();
export const openMenu = (next: ContextMenuState | null) => {
  menu = next;
  menuListeners.forEach((l) => l());
};
export const useMenu = () =>
  useSyncExternalStore((l) => {
    menuListeners.add(l);
    return () => menuListeners.delete(l);
  }, () => menu);
