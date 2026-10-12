// Annotations: labeled points, paths and areas. The old nav test field becomes annotations on load, and the export
// writes them in world coordinates as scene.json's `annotations`.

import type { Annotation, Project } from "./types.ts";

export const NAV_MAPPING = "nav:mapping";
export const NAV_GOAL = "nav:goal";

const spawnKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** a project with its old `nav` test turned into annotations (unchanged when it has none) */
export function withAnnotations(project: Project): Project {
  const nav = project.nav;
  if (!nav) return project;
  const annotations: Annotation[] = [...(project.annotations ?? [])];
  if (nav.mappingPath.length) {
    annotations.push({
      id: "nav_mapping",
      kind: "path",
      label: "Mapping walk",
      tags: [NAV_MAPPING],
      floor: nav.floor,
      points: nav.mappingPath,
      props: { start_spawn: spawnKey(nav.startSpawn) },
    });
  }
  nav.goals.forEach((goal, order) => {
    annotations.push({
      id: `nav_goal_${slug(goal.name) || order + 1}_${goal.id}`,
      kind: "point",
      label: goal.name,
      tags: [NAV_GOAL],
      floor: goal.floor,
      position: goal.position,
      props: { tolerance: goal.tolerance, timeout: goal.timeout, order },
    });
  });
  const { nav: _, ...rest } = project;
  return { ...rest, annotations };
}

/** the annotations as scene.json writes them: world coordinates, a readable unique id each */
export function exportAnnotations(project: Project): Record<string, unknown>[] {
  const lift = (floor: string) => project.floors.find((f) => f.id === floor)?.elevation ?? 0;
  const used = new Set<string>();
  return (withAnnotations(project).annotations ?? []).map((a) => {
    let id = slug(a.label) || a.kind;
    if (a.tags.includes(NAV_MAPPING) && !used.has("nav_mapping")) id = "nav_mapping";
    else if (a.tags.includes(NAV_GOAL)) id = `nav_goal_${slug(a.label) || "goal"}`;
    while (used.has(id)) id += "_";
    used.add(id);
    const up = lift(a.floor);
    const out: Record<string, unknown> = {
      id,
      kind: a.kind,
      label: a.label,
      tags: a.tags,
      frame: "world",
    };
    if (a.position) out.position = [a.position[0], a.position[1], a.position[2] + up];
    if (a.yaw !== undefined) out.yaw = a.yaw;
    if (a.points) out.points = a.points.map((p) => [p[0], p[1], p[2] + up]);
    if (a.kind === "area") out.height = a.height ?? 2;
    if (a.props && Object.keys(a.props).length) out.props = a.props;
    return out;
  });
}
