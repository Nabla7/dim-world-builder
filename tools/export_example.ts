// Writes the example worlds into examples/: deno run -A tools/export_example.ts [parent dir]
import { exportProject } from "../backend/export.ts";
import { testCourse } from "../src/world/examples.ts";
import { clutterYard } from "../src/world/examples_clutter.ts";
import type { MeshAsset } from "../src/world/types.ts";

const root = new URL("..", import.meta.url).pathname;
const parent = Deno.args[0] ?? `${root}examples`;
const library: MeshAsset[] = JSON.parse(await Deno.readTextFile(`${root}assets/library/index.json`));
const assets = Object.fromEntries(library.map((a) => [a.id, a]));
const dirs = Object.fromEntries(library.map((a) => [a.id, `${root}assets/library/${a.id}`]));
for (const project of [testCourse(), clutterYard()]) {
  const result = await exportProject(project, assets, dirs, parent);
  console.log(`${result.dir}: ${result.bodies} bodies, ${result.movers} movers, ${result.files.length} files`);
}
