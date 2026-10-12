// Scripted screen recordings of World Builder running inside dimOS Desktop (Playwright, headless Chromium).
//   deno run -A tools/videos/demo.ts <scene> [out dir]      scenes: see SCENES below
// Headless recordings have no mouse pointer, so the page gets a drawn one, and each step a caption.
import { type Browser, chromium, type Frame, type Page } from "npm:playwright@1.60.0";

export const DESKTOP = Deno.env.get("DESKTOP_URL") ?? "http://127.0.0.1:5555";
const SIZE = { width: 1600, height: 950 };

const CURSOR = `
(() => {
  if (window.__demoCursor) return;
  const dot = document.createElement("div");
  dot.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;" +
    "border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px rgba(0,0,0,.6);background:rgba(255,255,255,.25);" +
    "transition:transform .08s;left:-50px;top:-50px";
  document.documentElement.appendChild(dot);
  addEventListener("mousemove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => dot.style.transform = "scale(.7)", true);
  addEventListener("mouseup", () => dot.style.transform = "", true);
  window.__demoCursor = dot;
})();`;

export class Demo {
  constructor(public browser: Browser, public page: Page, public app: Frame) {}

  static async open(videoDir: string, hash = ""): Promise<Demo> {
    const browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=metal", "--enable-gpu"],
    });
    const context = await browser.newContext({
      viewport: SIZE,
      recordVideo: { dir: videoDir, size: SIZE },
    });
    await context.addInitScript(CURSOR);
    const page = await context.newPage();
    await page.goto(`${DESKTOP}/?app=dim-world-builder${hash}`);
    const deadline = Date.now() + 30000;
    let app: Frame | undefined;
    while (!app && Date.now() < deadline) {
      app = page.frames().find((f) => f.url().includes("/apps/dim-world-builder/"));
      if (!app) await page.waitForTimeout(250);
    }
    if (!app) throw new Error("World Builder's frame never appeared (is the app installed?)");
    await app.waitForSelector("[data-testid=sidebar]", { timeout: 30000 });
    await page.waitForTimeout(1500);
    return new Demo(browser, page, app);
  }

  /** a caption across the top of the window */
  async say(text: string, hold = 1200) {
    await this.page.evaluate((caption) => {
      let bar = document.getElementById("__demo_caption");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "__demo_caption";
        bar.style.cssText =
          "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;" +
          "padding:10px 18px;border-radius:10px;background:rgba(10,12,16,.82);color:white;font:500 19px system-ui;" +
          "pointer-events:none;max-width:80vw;text-align:center";
        document.body.appendChild(bar);
      }
      bar.textContent = caption;
    }, text);
    await this.page.waitForTimeout(hold);
  }

  /** the app frame's offset in the page */
  async offset(): Promise<[number, number]> {
    const box = await (await this.app.frameElement()).boundingBox();
    return [box?.x ?? 0, box?.y ?? 0];
  }

  /** page coordinates of an app-frame point */
  async toPage([x, y]: [number, number]): Promise<[number, number]> {
    const [ox, oy] = await this.offset();
    return [x + ox, y + oy];
  }

  async moveTo(x: number, y: number, steps = 25) {
    await this.page.mouse.move(x, y, { steps });
  }

  /** move to an element's center and click it */
  async click(selector: string, pause = 500) {
    const box = await this.app.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no ${selector}`);
    const [ox, oy] = await this.offset();
    await this.moveTo(ox + box.x + box.width / 2, oy + box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.page.waitForTimeout(pause);
  }

  async clickText(text: string, pause = 500) {
    await this.click(`text=${text}`, pause);
  }

  async drag(from: [number, number], to: [number, number], steps = 40) {
    await this.moveTo(...from);
    await this.page.mouse.down();
    await this.page.waitForTimeout(150);
    await this.moveTo(to[0], to[1], steps);
    await this.page.mouse.up();
    await this.page.waitForTimeout(400);
  }

  /** an item's base on screen (page coordinates), from the app's automation hook */
  async itemOnScreen(id: string): Promise<[number, number]> {
    const point = await this.app.evaluate(
      (itemId) =>
        (globalThis as unknown as {
          dimWorldBuilder: { itemOnScreen(id: string): [number, number] | null };
        })
          .dimWorldBuilder.itemOnScreen(itemId),
      id,
    );
    if (!point) throw new Error(`item ${id} is not drawn`);
    return this.toPage(point);
  }

  /** a point on the selected item's gizmo (gizmo units: its arrows and rings reach 0.5), in page coordinates */
  async gizmoOnScreen(local: [number, number, number]): Promise<[number, number]> {
    const id = await this.state<string>("s.selected");
    const point = await this.app.evaluate(
      ([itemId, l]) =>
        (globalThis as unknown as {
          dimWorldBuilder: { gizmoOnScreen(id: string, l: number[]): [number, number] | null };
        }).dimWorldBuilder.gizmoOnScreen(itemId as string, l as number[]),
      [id, local] as [string, number[]],
    );
    if (!point) throw new Error("nothing selected");
    return this.toPage(point);
  }

  async worldToScreen(x: number, y: number, z: number): Promise<[number, number]> {
    const point = await this.app.evaluate(
      ([px, py, pz]) =>
        (globalThis as unknown as {
          dimWorldBuilder: { worldToScreen(x: number, y: number, z: number): [number, number] };
        })
          .dimWorldBuilder.worldToScreen(px, py, pz),
      [x, y, z] as [number, number, number],
    );
    return this.toPage(point);
  }

  async lookAt(target: [number, number, number], from: [number, number, number]) {
    await this.app.evaluate(
      ([t, f]) =>
        (globalThis as unknown as { dimWorldBuilder: { lookAt(t: number[], f: number[]): void } })
          .dimWorldBuilder
          .lookAt(t, f),
      [target, from] as [number[], number[]],
    );
    await this.page.waitForTimeout(300);
  }

  async state<T>(pick: string): Promise<T> {
    return await this.app.evaluate((expression) => {
      const state = (globalThis as unknown as { dimWorldBuilder: { state(): unknown } })
        .dimWorldBuilder.state();
      return new Function("s", `return ${expression}`)(state);
    }, pick) as T;
  }

  /** nudge a slider with the keyboard (visible, exact): focus it, then press ←/→ */
  async slide(label: string, presses: number) {
    const slider = this.app.locator(`input[type=range][aria-label="${label}"]`).first();
    const box = await slider.boundingBox();
    if (box) {
      const [ox, oy] = await this.offset();
      await this.moveTo(ox + box.x + box.width / 2, oy + box.y + box.height / 2, 15);
    }
    await slider.focus();
    const key = presses > 0 ? "ArrowRight" : "ArrowLeft";
    for (let i = 0; i < Math.abs(presses); i++) {
      await this.page.keyboard.press(key);
      await this.page.waitForTimeout(70);
    }
    await this.page.waitForTimeout(300);
  }

  /** stop, save the video as mp4, return its path */
  async finish(out: string): Promise<string> {
    await this.page.waitForTimeout(800);
    const video = this.page.video();
    await this.page.context().close();
    await this.browser.close();
    const webm = await video!.path();
    const ffmpeg = new Deno.Command("ffmpeg", {
      args: [
        "-loglevel",
        "error",
        "-y",
        "-i",
        webm,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
      ],
    });
    const { success } = await ffmpeg.output();
    if (!success) throw new Error(`ffmpeg failed on ${webm}`);
    await Deno.remove(webm);
    return out;
  }
}
