// Vendors dimos-react (github.com/jeff-hykin/dimos-react) into src/vendor/dimos-react at a tag, so the build needs no network:
//   deno task vendor-dimos-react v0.2.0-beta3
// Builds the tag (its Vite library build: JS plus .d.ts types) and copies dist/, including the 3D view (three.*), minus
// source maps, plus the LICENSE.
import $ from "jsr:@david/dax@0.43.2";
import { walkSync } from "jsr:@std/fs@1/walk";

const tag = Deno.args[0];
if (!tag) {
  throw new Error("usage: deno task vendor-dimos-react <tag, e.g. v0.2.0-beta3>");
}
const target = $.path(new URL("../src/vendor/dimos-react", import.meta.url));
const scratch = $.path(await Deno.makeTempDir());
await $`git clone --quiet --depth 1 --branch ${tag} https://github.com/jeff-hykin/dimos-react ${scratch}`;
const commit = (await $`git -C ${scratch} rev-parse HEAD`.text()).trim();
await $`npm ci --ignore-scripts --no-audit --no-fund`.cwd(scratch).quiet();
await $`npx vite build`.cwd(scratch).quiet();
await target.remove({ recursive: true }).catch(() => {});
await target.parentOrThrow().mkdir({ recursive: true });
await $`cp -R ${scratch.join("dist")} ${target}`;
await scratch.join("LICENSE").copyFile(target.join("LICENSE"));
for (const entry of walkSync(target.toString())) {
  if (entry.name.endsWith(".map")) {
    Deno.removeSync(entry.path);
  } else if (entry.name.endsWith(".js")) {
    const code = Deno.readTextFileSync(entry.path);
    Deno.writeTextFileSync(entry.path, code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n"));
  }
}
await target.join("VERSION").writeText(`jeff-hykin/dimos-react ${tag} ${commit}\n`);
await scratch.remove({ recursive: true });
console.log(`src/vendor/dimos-react = dimos-react ${tag} (${commit}), built`);
