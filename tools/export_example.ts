// Writes the test course into examples/: deno run -A tools/export_example.ts [parent dir]
import { exportProject } from "../backend/export.ts";
import { testCourse } from "../src/world/examples.ts";

const parent = Deno.args[0] ?? new URL("../examples", import.meta.url).pathname;
const result = await exportProject(testCourse(), {}, {}, parent);
console.log(`${result.dir}: ${result.bodies} bodies, ${result.movers} movers, ${result.files.length} files`);
