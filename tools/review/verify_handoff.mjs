/** Exercise real renderer reload/rollback with an isolated copy of the export manifest. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const bundle = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error(
    "Usage: node tools/review/verify_handoff.mjs /path/to/bundle",
  );
}
const port = Number(process.env.REVIEW_QA_PORT ?? 8799);
const base = `http://127.0.0.1:${port}`;
const temp = await mkdtemp(join(tmpdir(), "scene-review-handoff-"));
const derived = join(temp, "derived");
await mkdir(derived);
const manifest = JSON.parse(await readFile(join(bundle, "scene.json"), "utf8"));
for (const name of await readdir(bundle)) {
  if (name !== "scene.json") {
    await symlink(join(bundle, name), join(derived, name));
  }
}
const revision = `${manifest.revision}-handoff-test`;
await writeFile(
  join(derived, "scene.json"),
  JSON.stringify({ ...manifest, revision }),
);
const server = spawn("./result/bin/dimos-app-server", [
  "--port",
  String(port),
  "--review",
  bundle,
], {
  env: {
    ...process.env,
    DIMOS_APP: JSON.stringify({ dataDir: join(temp, "data") }),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (data) => {
  logs += data;
});
server.stderr.on("data", (data) => {
  logs += data;
});
let browser;
const request = async (path, body) => {
  const response = await fetch(
    `${base}/api/review/${path}`,
    body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
};
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      await request("bundle");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?workspace=review`);
  await page.waitForFunction(() => window.sceneReview?.viewer.ready, {}, {
    timeout: 60000,
  });
  await page.evaluate(() => window.sceneReview.goToSecond(124));
  const before = await page.evaluate(() => window.sceneReview.getState().focus);
  const published = await request("open", {
    bundleDir: derived,
    expectedRevision: manifest.revision,
  });
  assert.equal(published.command.applied, false);
  await page.waitForFunction(
    (name) => window.sceneReview?.getState().focus?.revision === name,
    revision,
    { timeout: 60000 },
  );
  const after = await page.evaluate(() => window.sceneReview.getState().focus);
  assert.deepEqual(after.camera, before.camera);
  assert.equal(after.sourceSecond, before.sourceSecond);
  await page.waitForFunction(async () =>
    (await (await fetch("api/review/updates")).json()).command.applied
  );
  await page.reload();
  await page.waitForFunction(
    (name) => window.sceneReview?.getState().focus?.revision === name,
    revision,
    { timeout: 60000 },
  );
  await page.getByRole("combobox", { name: "Scene revision" }).selectOption(
    manifest.revision,
  );
  await page.waitForFunction(
    (name) => window.sceneReview?.getState().focus?.revision === name,
    manifest.revision,
    { timeout: 60000 },
  );
  await page.waitForFunction(async () =>
    (await (await fetch("api/review/updates")).json()).command.applied
  );
  assert.equal((await request("updates")).revision, manifest.revision);
  assert.deepEqual(errors, []);
  await mkdir(".data/desktop", { recursive: true });
  await writeFile(
    ".data/desktop/handoff-check.json",
    JSON.stringify(
      {
        before,
        after,
        errors,
        restored: manifest.revision,
        scope:
          "Manifest-only derived revision; actual renderer reload and rollback, not Blender authoring or geometry validation.",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS renderer reload preserves camera; revision survives page reload; revision picker restores baseline.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) {
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await rm(temp, { recursive: true, force: true });
}
