// The editor's state: the project (with undo), the selection, the tool. A tiny external store so the 3D view (outside
// React's render) and the panels read the same thing.

import { useSyncExternalStore } from "react";
import { emptyProject } from "../world/defaults.ts";
import type { Floor, Item, MoverPath, Project, Vec3 } from "../world/types.ts";

export type Gizmo = "translate" | "rotate" | "scale";
export type Mode = "edit" | "view";

export interface EditorState {
  project: Project;
  selected: string | null;
  gizmo: Gizmo;
  mode: Mode;
  snap: boolean;
  showCollision: boolean;
  /** the item whose mover path clicks on the ground extend */
  drawingPath: string | null;
  past: Project[];
  future: Project[];
  /** the last time the project changed, for autosave */
  revision: number;
}

let state: EditorState = {
  project: emptyProject(),
  selected: null,
  gizmo: "translate",
  mode: "edit",
  snap: true,
  showCollision: false,
  drawingPath: null,
  past: [],
  future: [],
  revision: 0,
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
  const past = coalesce && coalesce === coalesceKey ? state.past : [...state.past.slice(-99), state.project];
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
  set({ project: next, past: [...state.past, state.project], future: state.future.slice(1), revision: state.revision + 1 });
}

export function loadProject(project: Project) {
  coalesceKey = null;
  set({ project, selected: null, past: [], future: [], drawingPath: null, revision: state.revision + 1 });
}

export const select = (selected: string | null) => set({ selected, drawingPath: null });
export const setGizmo = (gizmo: Gizmo) => set({ gizmo });
export const setMode = (mode: Mode) => set({ mode, drawingPath: null });
export const setSnap = (snap: boolean) => set({ snap });
export const setShowCollision = (showCollision: boolean) => set({ showCollision });
export const setDrawingPath = (drawingPath: string | null) => set({ drawingPath });

export function selectedItem(): Item | null {
  return state.project.items.find((i) => i.id === state.selected) ?? null;
}

export function addItem(item: Item) {
  edit((p) => ({ ...p, items: [...p.items, item] }));
  set({ selected: item.id });
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

export function addFloor() {
  edit((p) => {
    const top = Math.max(...p.floors.map((f) => f.elevation));
    const id = `floor_${crypto.randomUUID().slice(0, 6)}`;
    const floor: Floor = { id, name: `Floor ${p.floors.length + 1}`, elevation: top + 3 };
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
  edit((p) => ({ ...p, floors: p.floors.map((f) => (f.id === id ? { ...f, ...change } : f)) }), `floor-${id}`);
}

export function renameProject(name: string) {
  edit((p) => ({ ...p, name }), "name");
}
