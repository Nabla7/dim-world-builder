// Every item's readable id ("bed_2"): the entity name in the exported scene.json, so tasks and nav goals can name
// things ("within 0.3 m of bed_2"). Unique within a world; the editor lets you rename it.

import type { Item, Project } from "./types.ts";

/** lower snake case, starting with a letter */
export function slug(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(s) ? s : `item_${s}`;
}

/** what an item is, for its default id: the mesh's or shape's name, or its kind */
function base(item: Item): string {
  if (item.kind === "primitive") return slug(item.params.shape);
  if (item.kind === "apriltag") return `apriltag_${item.params.id}`;
  return slug(item.name.replace(/\s+copy$/i, "") || item.kind);
}

/** the next free `<base>_<n>` among the keys already used */
export function nextKey(item: Item, used: Set<string>): string {
  const b = base(item);
  for (let n = 1;; n++) {
    const key = `${b}_${n}`;
    if (!used.has(key)) return key;
  }
}

/** give every item that lacks one (or shares one) a unique key; returns new item objects only where changed */
export function withKeys(items: Item[], existing: Item[] = []): Item[] {
  const used = new Set(existing.map((i) => i.key).filter((k): k is string => Boolean(k)));
  return items.map((item) => {
    if (item.key && !used.has(item.key)) {
      used.add(item.key);
      return item;
    }
    const key = nextKey(item, used);
    used.add(key);
    return { ...item, key };
  });
}

export function keyedProject(project: Project): Project {
  const items = withKeys(project.items);
  return items.every((item, i) => item === project.items[i]) ? project : { ...project, items };
}
