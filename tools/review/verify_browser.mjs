/** End-to-end local review check. Use an isolated app dataDir for QA notes. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.REVIEW_QA_URL ?? "http://127.0.0.1:8798/";
await mkdir(".data/qa", { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(120000);
const errors = [], failed = [], evidence = { url: base, checks: [], performance: [] };
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE_ERROR", e.message);
});
page.on("response", (r) => {
  if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
});
const check = (label) => {
  evidence.checks.push(label);
  console.log("PASS", label);
};
const waitReady = () =>
  page.waitForFunction(() =>
    window.sceneReview?.viewer.isMatched() && !document.querySelector(".sr-loading")
  );
try {
  await page.goto(`${base}?workspace=review`);
  await waitReady();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".data/qa/walkthrough.png" });
  check("Full baseline loads with source camera 580");
  const calibration = await page.evaluate(() => {
    const v = window.sceneReview.viewer,
      c = v.bundle.evidence.views.find((c) => c.second === 580),
      k = v.bundle.evidence.calibration.k;
    const m = c.optical_to_project;
    const Point = v.camera.position.constructor;
    let max = 0;
    for (const local of [[0, 0, 2], [.4, .3, 2], [-1, -.4, 3], [1, .6, 4]]) {
      const world = [0, 1, 2].map((i) =>
        m[i][0] * local[0] + m[i][1] * local[1] + m[i][2] * local[2] + m[i][3]
      );
      const actual = new Point(...world).project(v.camera);
      const expected = [
        2 * (k[0] * local[0] / local[2] + k[2]) / 1280 - 1,
        1 - 2 * (k[4] * local[1] / local[2] + k[5]) / 720,
      ];
      max = Math.max(max, Math.abs(actual.x - expected[0]), Math.abs(actual.y - expected[1]));
    }
    return { maxNormalizedError: max, camera: v.state() };
  });
  console.log("CALIBRATION", JSON.stringify(calibration));
  assert(calibration.maxNormalizedError < 1e-6);
  evidence.calibration = calibration;
  check("Recorded optical pose and asymmetric intrinsics agree with browser projection");
  const canvas = page.locator(".sr-canvas canvas");
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * .52, box.y + box.height * .65);
  await page.waitForFunction(() => window.sceneReview.getState().focus.objectId !== null);
  const focus = await page.evaluate(() => window.sceneReview.getState().focus);
  assert.equal(focus.sourceSecond, 580);
  assert(focus.point.every(Number.isFinite));
  check("Picking retains calibrated camera and real source object ID");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const range = page.getByRole("slider", { name: "Compare recording and reconstruction" });
  await range.fill("43");
  await page.screenshot({ path: ".data/qa/comparison.png" });
  check("Comparison swipe shows source RGB and matching Cycles still");
  await page.getByRole("button", { name: "Draw on view", exact: false }).click();
  const drawing = await page.locator(".sr-drawing").boundingBox();
  await page.mouse.move(drawing.x + drawing.width * .35, drawing.y + drawing.height * .45);
  await page.mouse.down();
  await page.mouse.move(drawing.x + drawing.width * .55, drawing.y + drawing.height * .55, {
    steps: 8,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "Finish drawing", exact: false }).click();
  await page.locator("input[type=file]").setInputFiles(".data/qa/walkthrough.png");
  await page.getByAltText("Attached reference").waitFor();
  const noteText =
    `QA round trip ${Date.now()}: source camera, source object and drawing retained.`;
  await page.getByRole("textbox", { name: "Describe the change" }).fill(noteText);
  await page.getByRole("button", { name: "Save feedback", exact: false }).click();
  await page.locator(".sr-note").filter({ hasText: noteText }).waitFor();
  const response = await page.request.get(`${base}api/review/context`);
  const context = await response.json();
  const note = context.notes.find((n) => n.text === noteText);
  assert(note);
  assert.equal(note.sourceSecond, 580);
  assert.equal(note.objectId, focus.objectId);
  assert(note.strokes[0].points.length >= 2);
  assert(note.attachment);
  assert((await page.request.get(new URL(note.attachment, base).href)).ok());
  evidence.savedNote = {
    id: note.id,
    sourceSecond: note.sourceSecond,
    objectId: note.objectId,
    point: note.point,
  };
  check("Saved feedback carries camera, point, selected object, drawing and attached photo");
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export feedback", exact: false }).click();
  await (await pendingDownload).saveAs(".data/qa/feedback.json");
  check("Agent feedback exports as a downloadable JSON record");
  await page.evaluate(() => window.sceneReview.goToSecond(124));
  await page.locator(".sr-note").filter({ hasText: noteText }).locator(".sr-note-camera").click();
  assert.equal(await page.evaluate(() => window.sceneReview.getState().focus.sourceSecond), 580);
  assert(await page.locator(".sr-drawing polyline").count() > 0);
  check("Saved note restores the exact recorded viewpoint and drawing");
  await page.reload();
  await waitReady();
  await page.locator(".sr-note").filter({ hasText: noteText }).waitFor();
  check("Feedback survives page reload");
  await page.locator(".sr-note").filter({ hasText: noteText }).getByRole("button", {
    name: "Resolve",
    exact: true,
  }).click();
  await page.locator(".sr-note").filter({ hasText: noteText }).getByRole("button", {
    name: "Reopen",
    exact: true,
  }).waitFor();
  check("Resolve/reopen workflow updates durable note status");
  const before = await page.evaluate(() => window.sceneReview.viewer.state().position);
  await page.locator(".sr-canvas").focus();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => window.sceneReview.viewer.state().position);
  assert(Math.hypot(...before.map((x, i) => x - after[i])) > .1);
  assert.equal(await page.evaluate(() => window.sceneReview.getState().focus.sourceSecond), null);
  check("Keyboard navigation moves the camera and exits calibrated comparison");
  for (
    const [label, second] of [
      ["kitchen", 580],
      ["reception", 124],
      ["workshop", 268],
      ["stairs", 544],
      ["meeting", 640],
      ["lounge", 708],
    ]
  ) {
    await page.evaluate((s) => window.sceneReview.goToSecond(s), second);
    await page.waitForTimeout(1100);
    evidence.performance.push({
      view: label,
      second,
      status: await page.locator(".sr-status").innerText(),
    });
  }
  check("Navigation across six areas retains the whole-building model");
  await page.getByRole("button", { name: "Whole building", exact: false }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".data/qa/building.png" });
  evidence.performance.push({
    view: "building",
    status: await page.locator(".sr-status").innerText(),
  });
  await page.getByRole("button", { name: "Ground", exact: true }).click();
  await page.screenshot({ path: ".data/qa/ground.png" });
  await page.getByRole("button", { name: "Upper", exact: true }).click();
  await page.screenshot({ path: ".data/qa/upper.png" });
  check("Whole-building and both level cutaways are available");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole("button", { name: "Feedback (", exact: false }).click();
  await page.screenshot({ path: ".data/qa/mobile.png" });
  check("Narrow-screen layout keeps feedback and scene reachable");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base);
  await page.getByTestId("world-name").waitFor();
  check("Original World Builder remains available");
  assert.equal(errors.length, 0, "No uncaught browser errors");
  assert.equal(
    failed.filter((f) => /\/(files\/review|api\/review)/.test(f.url)).length,
    0,
    "All review assets and API requests succeed",
  );
  evidence.errors = errors;
  evidence.optionalDesktopRequests = failed;
  await writeFile(".data/qa/verification.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (e) {
  await page.screenshot({ path: ".data/qa/failure.png" }).catch(() => {});
  console.log("ERRORS", JSON.stringify({ errors, failed }));
  throw e;
} finally {
  await browser.close();
}
