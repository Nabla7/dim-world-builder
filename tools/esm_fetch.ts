// A Vite plugin that bundles https imports (dimos-react from esm.sh, as deno.json names it) instead of leaving them
// for the browser: each URL is fetched once into a cache folder, and the modules it imports by absolute path ("/gh/…")
// or relative path resolve against its URL. Bare imports esm.sh leaves (react, react-dom, three, kept external with
// ?external=…) resolve to this page's own, so there is one copy of each.
//   ESM_CACHE   the cache folder (default node_modules/.esm-cache)
//   ESM_OFFLINE set: a URL not in the cache is an error (nix builds offline from a prefetched cache)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { Plugin } from "vite";

const isUrl = (id: string) => /^https?:\/\//.test(id);
// Vite treats an http module ID as external in dev. A virtual ID makes its
// import analysis rewrite the bare React/Three imports just as the build does.
const prefix = "\0esm-fetch:";

export function esmFetch(aliases: Record<string, string>): Plugin {
  const cacheDir = process.env.ESM_CACHE ?? join(process.cwd(), "node_modules", ".esm-cache");
  const offline = !!process.env.ESM_OFFLINE;
  const fileFor = (url: string) =>
    join(cacheDir, createHash("sha256").update(url).digest("hex") + ".js");
  return {
    name: "esm-fetch",
    enforce: "pre",
    resolveId(id, importer) {
      if (id in aliases) {
        return prefix + aliases[id];
      }
      if (isUrl(id)) {
        return prefix + id;
      }
      // inside a fetched module: its absolute and relative imports are on its host
      if (importer?.startsWith(prefix) && (id.startsWith("/") || id.startsWith("."))) {
        return prefix + new URL(id, importer.slice(prefix.length)).href;
      }
      return null;
    },
    async load(id) {
      if (!id.startsWith(prefix)) {
        return null;
      }
      const url = id.slice(prefix.length);
      const file = fileFor(url);
      if (existsSync(file)) {
        return readFileSync(file, "utf8");
      }
      if (offline) {
        throw new Error(
          `${url} isn't in the prefetched cache ${cacheDir} (ESM_OFFLINE): its nix hash needs updating`,
        );
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
      }
      const code = await response.text();
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, code);
      return code;
    },
  };
}
