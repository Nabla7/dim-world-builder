import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
// This deliberately sends a real model request and saves a shared view in the active profile.
if (process.env.RUN_LIVE_AGENT !== "1") {
  throw new Error(
    "Set RUN_LIVE_AGENT=1 to exercise the configured Desktop agent (uses its model credentials).",
  );
}
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://127.0.0.1:5555";
try {
  await page.goto(base + "/?app=dim-world-builder#/?workspace=review");
  await page.waitForTimeout(1200);
  const frame = page.frames().find((f) => f.url().includes("/apps/dim-world-builder/"));
  await frame.waitForFunction(() => window.sceneReview?.viewer.ready, {}, { timeout: 60000 });
  const canvas = await frame.locator(".sr-canvas canvas").boundingBox();
  await page.mouse.click(canvas.x + canvas.width * .55, canvas.y + canvas.height * .60);
  await frame.waitForFunction(() => window.sceneReview.getState().focus.objectId !== null);
  const focus = await frame.evaluate(() => window.sceneReview.getState().focus);
  console.log("SELECTED", focus.objectId);
  await frame.getByRole("textbox", { name: "Describe the change" }).fill(
    "Before changing anything, inspect the object I selected and the recording reference for this shared view. Tell me what you see in two sentences. Then show me the recorded Reception view at second 124. Do not edit scene geometry.",
  );
  await frame.getByRole("button", { name: /Share view with agent/ }).click();
  const portal = page.frames().find((f) => f.url().includes("/agent-gateway/portal")); // dimos-yaml-check: ignore — identifies an existing iframe, not an app API call.
  const responses = [];
  page.on(
    "websocket",
    (ws) => ws.on("framereceived", (event) => responses.push(String(event.payload))),
  );
  let text = "";
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    if (i % 15 === 0) {
      text = await portal.locator("body").innerText();
      console.log("CHAT", text.slice(-1600));
    }
    const current = await frame.evaluate(() => window.sceneReview.getState().focus);
    if (current.sourceSecond === 124) {
      console.log("AGENT_VIEW_APPLIED");
      break;
    }
  }
  await page.waitForTimeout(1000);
  const context = await frame.evaluate(async () => (await fetch("api/review/context")).json());
  const current = await frame.evaluate(() => window.sceneReview.getState().focus);
  text = await portal.locator("body").innerText();
  const evidence = {
    focus,
    current,
    context,
    chat: text,
    errors,
    session: await page.evaluate(() => localStorage.getItem("dimos.portal.session")),
  };
  await writeFile(".data/desktop/agent-check.json", JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: ".data/desktop/agent-check.png" });
  console.log("FINAL_CHAT", text.slice(-6500));
  assert.equal(context.latestSharedView.objectId, focus.objectId);
  assert.equal(context.latestSharedView.sourceSecond, 580);
  assert.equal(current.sourceSecond, 124);
  assert.equal(context.viewCommand.applied, true);
  assert.equal(errors.length, 0);
  console.log(
    "PASS real dimcode conversation inspected shared context and changed the browser view",
  );
} finally {
  await browser.close();
}
