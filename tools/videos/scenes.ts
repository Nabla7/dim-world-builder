// The feature videos: deno run -A tools/videos/scenes.ts <scene|all> [out dir] [--glb path]
// Each scene drives World Builder inside dimOS Desktop like a person would (pointer, keys) and saves an mp4.
import { Demo } from "./demo.ts";

const args = Deno.args.filter((a) => !a.startsWith("--"));
const flag = (name: string) => {
  const i = Deno.args.indexOf(`--${name}`);
  return i === -1 ? undefined : Deno.args[i + 1];
};
const which = args[0] ?? "all";
const outDir = args[1] ?? new URL("../../videos", import.meta.url).pathname;
const scratch = await Deno.makeTempDir({ prefix: "dwb-video-" });
await Deno.mkdir(outDir, { recursive: true });

async function fresh(demo: Demo, name: string) {
  // a new empty world, named for the video
  await demo.app.selectOption("[data-testid=open-world]", { label: "New empty world" });
  await demo.page.waitForTimeout(600);
  const input = demo.app.locator("[data-testid=world-name]");
  await input.fill(name);
  await demo.page.waitForTimeout(300);
}

async function addFromPalette(demo: Demo, key: string, search?: string) {
  if (search) {
    await demo.app.locator("[data-testid=add-panel] input").first().fill(search);
    await demo.page.waitForTimeout(400);
  }
  await demo.app.locator(`[data-testid="add-${key}"]`).scrollIntoViewIfNeeded();
  await demo.click(`[data-testid="add-${key}"]`, 700);
  if (search) {
    await demo.app.locator("[data-testid=add-panel] input").first().fill("");
  }
}

const selectedId = (demo: Demo) => demo.state<string>("s.selected");

/**
 * drag the selected item's gizmo: Move goes along the X arrow then the Y arrow (dx, dy in screen pixels along each),
 * Rotate along the yaw ring, Scale from the center box (uniform)
 */
async function dragSelected(demo: Demo, dx: number, dy: number, steps = 40) {
  const gizmo = await demo.state<string>("s.gizmo");
  if (gizmo === "translate") {
    for (const [axis, amount] of [[[1, 0, 0], dx], [[0, 1, 0], dy]] as const) {
      if (!amount) continue;
      const from = await demo.gizmoOnScreen([axis[0] * 0.35, axis[1] * 0.35, 0]);
      const ahead = await demo.gizmoOnScreen([axis[0] * 0.6, axis[1] * 0.6, 0]);
      const length = Math.hypot(ahead[0] - from[0], ahead[1] - from[1]) || 1;
      const unit = [(ahead[0] - from[0]) / length, (ahead[1] - from[1]) / length];
      await demo.drag(from, [from[0] + unit[0] * amount, from[1] + unit[1] * amount], steps);
    }
    return;
  }
  const handle: [number, number, number] = gizmo === "rotate" ? [0.354, 0.354, 0] : [0, 0, 0];
  const [x, y] = await demo.gizmoOnScreen(handle);
  await demo.drag([x, y], [x + dx, y + dy], steps);
}

const SCENES: Record<string, (demo: Demo) => Promise<void>> = {
  async "1_import_and_cook"(demo) {
    const glb = flag("glb");
    if (!glb) throw new Error("--glb <file> is needed for the import video");
    await fresh(demo, "import_demo");
    await demo.say("Import a 3D model: a CC0 armchair from Poly Haven (.glb)", 1800);
    await demo.click("[data-testid=import-open]");
    await demo.app.setInputFiles("[data-testid=import-file]", glb);
    await demo.page.waitForTimeout(600);
    await demo.say(
      "Cooking: make it Z-up, sit it on the floor, split its look by color, decompose it into convex pieces",
      400,
    );
    await demo.click("[data-testid=cook]");
    await demo.app.waitForSelector("text=Done", { timeout: 180000 });
    await demo.say(
      "Cooked: checked in MuJoCo, added to the palette and dropped into the world",
      1500,
    );
    await demo.clickText("Done");
    await demo.say(
      "Collision on: the magenta wireframes are the convex pieces the robot collides with",
      2500,
    );
    await demo.say(
      "The lidar and camera see the real shape; physics uses the convex decomposition",
      3000,
    );
    await demo.click("[data-testid=show-collision]");
    await demo.say("Collision off: the model as it looks", 2000);
  },

  async "2_add_move_rotate_scale"(demo) {
    await fresh(demo, "transform_demo");
    await demo.say(
      "Add things from the palette, then move, rotate and scale them with the gizmo",
      1500,
    );
    await addFromPalette(demo, "shape:box");
    await demo.say("Move (W): drag the handle", 400);
    await dragSelected(demo, 180, 40);
    await dragSelected(demo, -60, 90);
    await demo.page.keyboard.press("e");
    await demo.say("Rotate (E)", 400);
    await dragSelected(demo, 120, -20);
    await demo.page.keyboard.press("r");
    await demo.say("Scale (R)", 400);
    await dragSelected(demo, 40, -30);
    await dragSelected(demo, -20, 15);
    await demo.page.keyboard.press("w");
    await demo.say("Or type exact numbers in the inspector", 600);
    const yaw = demo.app.locator("[data-testid=inspector] input").nth(4);
    await yaw.click();
    await yaw.fill("45");
    await yaw.press("Enter");
    await demo.page.waitForTimeout(800);
    await addFromPalette(demo, "asset:office_chair", "chair");
    await dragSelected(demo, -220, 60);
    await demo.page.keyboard.press("r");
    await dragSelected(demo, 30, -20);
    await demo.page.keyboard.press("w");
    await demo.say("Ctrl+D duplicates, Delete removes, Ctrl+Z undoes", 600);
    await demo.page.keyboard.press("Control+d");
    await demo.page.waitForTimeout(600);
    await dragSelected(demo, 150, 80);
    await demo.page.keyboard.press("Delete");
    await demo.page.waitForTimeout(600);
    await demo.page.keyboard.press("Control+z");
    await demo.say("Undone", 1500);
  },

  async "3_stairs"(demo) {
    await fresh(demo, "stairs_demo");
    await demo.say("The staircase tool", 1000);
    await addFromPalette(demo, "build:stairs");
    await demo.say("Step height", 300);
    await demo.slide("Step height", 6);
    await demo.slide("Step height", -10);
    await demo.say("Step depth", 300);
    await demo.slide("Step depth", 12);
    await demo.say("Width", 300);
    await demo.slide("Width", -8);
    await demo.slide("Width", 14);
    await demo.say("Number of steps", 300);
    await demo.slide("Steps", 5);
    await demo.say("Open risers: thin treads with gaps between them, like a ladder", 400);
    await demo.clickText("Open risers (gaps between steps, ladder-like)");
    await demo.page.waitForTimeout(800);
    await demo.slide("Tread thickness", 4);
    await demo.slide("Step height", 6);
    await demo.say(
      "Every one exports as solid MuJoCo boxes the robot steps on (and the lidar sees)",
      2500,
    );
  },

  async "4_hills"(demo) {
    await fresh(demo, "hill_demo");
    await demo.say("Hills: natural bumpiness from fractal noise", 1000);
    await addFromPalette(demo, "build:hill");
    await demo.say("Bump height", 300);
    await demo.slide("Bump height", 12);
    await demo.say("Bumpiness (how many bumps)", 300);
    await demo.slide("Bumpiness", 10);
    await demo.say("Roughness (fine detail)", 300);
    await demo.slide("Roughness", 6);
    await demo.say("Detail octaves", 300);
    await demo.slide("Detail (octaves)", 2);
    await demo.say("A new seed is a new hill", 300);
    for (let i = 0; i < 3; i++) {
      await demo.click('button[aria-label="New seed"]', 900);
    }
    await demo.slide("Size X", 10);
    await demo.say("Exported as a MuJoCo heightfield", 2000);
  },

  async "5_asset_palette"(demo) {
    await fresh(demo, "palette_demo");
    await demo.say("The palette: shapes, clutter, builders and a CC0 model library", 800);
    const sidebar = demo.app.locator("[data-testid=sidebar]");
    const box = await sidebar.boundingBox();
    const [ox, oy] = await demo.offset();
    await demo.moveTo(ox + (box?.x ?? 0) + 150, oy + (box?.y ?? 0) + 400);
    for (let i = 0; i < 26; i++) {
      await demo.page.mouse.wheel(0, 160);
      await demo.page.waitForTimeout(140);
    }
    await demo.page.waitForTimeout(800);
    for (let i = 0; i < 26; i++) {
      await demo.page.mouse.wheel(0, -160);
      await demo.page.waitForTimeout(60);
    }
    const place = async (key: string, dx: number, dy: number, search?: string) => {
      await addFromPalette(demo, key, search);
      await dragSelected(demo, dx, dy, 30);
    };
    await demo.say("Boxes, staircases, cones, beanbags…", 300);
    await place("shape:box", -250, -60);
    await place("build:stairs", 120, -120);
    await place("shape:cone", -120, 120);
    await place("shape:beanbag", 60, 160);
    await demo.page.keyboard.press("r");
    await dragSelected(demo, 30, -20, 25);
    await demo.page.keyboard.press("e");
    await dragSelected(demo, 100, 0, 25);
    await demo.page.keyboard.press("w");
    await demo.say("…bowling pins, pipes, a ladder lying flat…", 300);
    await place("shape:bowling_pin", 220, 40);
    await place("shape:pipe", -240, 140);
    await place("shape:ladder", 260, 170);
    await demo.say("…and furniture from the library", 300);
    await place("asset:sofa", -300, -180, "sofa");
    await place("asset:bookcase", 330, -150, "book");
    await demo.say("Scatter clutter: a seeded mess of things to trip over", 300);
    await addFromPalette(demo, "build:scatter");
    await demo.page.waitForTimeout(2000);
  },

  async "6_floors"(demo) {
    await fresh(demo, "floors_demo");
    await demo.say("Floors: build a level, add one above, edit one floor at a time", 800);
    await addFromPalette(demo, "build:room");
    await addFromPalette(demo, "shape:box");
    await dragSelected(demo, 60, 40);
    await demo.clickText("Floors");
    await demo.say("Add a floor 3 m up: it becomes the floor you edit", 400);
    await demo.click("[data-testid=add-floor]");
    await demo.clickText("Add", 500);
    await addFromPalette(demo, "build:room");
    await addFromPalette(demo, "shape:beanbag");
    await dragSelected(demo, -80, 30);
    await demo.say(
      "The ground floor is drawn faded and can't be picked while you work up here",
      1800,
    );
    await demo.clickText("Floors");
    await demo.say("Pick the ground floor again: now the upper floor fades", 400);
    await demo.click("[data-testid=floor-ground]");
    await demo.page.waitForTimeout(1500);
    await demo.clickText("Items");
    await demo.say("Remove something from this floor only", 400);
    await demo.clickText("Box");
    await demo.page.keyboard.press("Delete");
    await demo.page.waitForTimeout(1200);
    await demo.clickText("Floors");
    await demo.say("Remove a whole floor (and what's on it)", 400);
    await demo.click('button[aria-label^="Remove Floor"]');
    await demo.page.waitForTimeout(1800);
  },

  async "7_rooms"(demo) {
    await fresh(demo, "rooms_demo");
    await demo.say("Rooms: walls, doors and a ceiling in one item", 800);
    await addFromPalette(demo, "build:room");
    await demo.say("Width and depth", 300);
    await demo.slide("Width (x)", 20);
    await demo.slide("Depth (y)", 15);
    await demo.say("Height", 300);
    await demo.slide("Height", -8);
    await demo.say("Ceiling off and on", 300);
    await demo.clickText("Ceiling", 1200);
    await demo.clickText("Ceiling", 900);
    await demo.say("Add a door and move it along the wall", 300);
    await demo.clickText("Add a door");
    await demo.slide("Offset", 15);
    await demo.slide("Door width", 6);
    await demo.say("Resize with the scale gizmo too", 300);
    await demo.page.keyboard.press("r");
    await dragSelected(demo, 30, -20);
    await demo.page.keyboard.press("w");
    await demo.say("A second room, then remove it", 300);
    await addFromPalette(demo, "build:room");
    await dragSelected(demo, 260, 120);
    await demo.page.waitForTimeout(700);
    await demo.click('button:has-text("Remove")');
    await demo.page.waitForTimeout(1500);
  },

  async "8_moving_objects"(demo) {
    await fresh(demo, "movers_demo");
    await demo.say("Moving objects: any item can ride a looping path", 800);
    await addFromPalette(demo, "shape:box");
    await demo.say("Make it move, then click points on the floor", 300);
    await demo.click("[data-testid=make-mover]");
    for (const [x, y] of [[3, 0], [3, 3], [0, 3]] as const) {
      const [sx, sy] = await demo.worldToScreen(x, y, 0);
      await demo.moveTo(sx, sy, 20);
      await demo.page.mouse.down();
      await demo.page.mouse.up();
      await demo.page.waitForTimeout(600);
    }
    await demo.click("[data-testid=draw-path]");
    await demo.say("Speed", 300);
    await demo.slide("Speed", 10);
    await demo.say("Loop, or back and forth", 300);
    await demo.clickText("Back and forth", 1200);
    await demo.clickText("Loop", 1200);
    await demo.say(
      "In the simulation it's a kinematic body: it shoves the robot and lidar sees it",
      2500,
    );
  },

  async "10_nav_test"(demo) {
    await demo.app.selectOption("[data-testid=open-world]", { label: "Example: nav test course" });
    await demo.page.waitForTimeout(1500);
    await demo.say("Nav test: a trajectory that evaluates any navigation stack", 800);
    await demo.clickText("Nav test");
    await demo.say(
      "This world already has one: a mapping walk (dashed) and two goals (flags)",
      2500,
    );
    await demo.clickText("Clear");
    await demo.say("Draw a new mapping path: where the robot walks first, to build its map", 300);
    await demo.click("[data-testid=nav-draw-path]");
    for (
      const [x, y] of [[0, -3.5], [3, -4.2], [5.5, -4], [5.5, -3.1], [8.5, -3.6], [9.5, 0], [
        8.5,
        3.6,
      ]] as const
    ) {
      const [sx, sy] = await demo.worldToScreen(x, y, 0);
      await demo.moveTo(sx, sy, 18);
      await demo.page.mouse.down();
      await demo.page.mouse.up();
      await demo.page.waitForTimeout(350);
    }
    await demo.click("[data-testid=nav-draw-path]");
    await demo.say("Then the goals the nav stack must reach", 300);
    await demo.click("[data-testid=nav-add-goal]");
    for (const [x, y] of [[6.5, 1], [-3, 3]] as const) {
      const [sx, sy] = await demo.worldToScreen(x, y, 0);
      await demo.moveTo(sx, sy, 18);
      await demo.page.mouse.down();
      await demo.page.mouse.up();
      await demo.page.waitForTimeout(500);
    }
    await demo.click("[data-testid=nav-add-goal]");
    await demo.slide("Goal tolerance", 4);
    await demo.say(
      "Exported as nav_eval.json; verify/nav_eval.py runs it on any robot: Twist to walk, PoseStamped goals",
      4000,
    );
  },

  async "9_viewer_mode"(demo) {
    // open the test course, export it from the app, run a simulated Go2 in the export, watch it in Viewer mode
    await demo.app.selectOption("[data-testid=open-world]", { label: "Example: nav test course" });
    await demo.page.waitForTimeout(1500);
    await demo.say("Export the world for dimos", 600);
    await demo.click("[data-testid=export]", 800);
    await demo.click("[data-testid=export-go]");
    await demo.app.waitForSelector("[data-testid=export-result]", { timeout: 60000 });
    const dir = (await demo.app.locator("[data-testid=export-result] b").first().textContent())!
      .trim();
    await demo.say(`Exported to ${dir}`, 2500);
    await demo.clickText("Done");
    const python = flag("python") ?? `${Deno.env.get("HOME")}/repos/dimos_sim2/.venv/bin/python`;
    const sim = new Deno.Command(python, {
      args: [
        new URL("../../verify/drive_go2.py", import.meta.url).pathname,
        dir,
        "--only",
        "wall,mover",
      ],
      env: { PYTHONPATH: "" },
      stdout: "null",
      stderr: "null",
    }).spawn();
    try {
      await demo.say("A simulated Go2 (dimos sim2) starts in the exported world…", 400);
      await demo.click("[data-testid=mode] >> text=Viewer", 500);
      await demo.lookAt([2, -3, 0], [-6, -14, 7]);
      await demo.say(
        "Viewer mode: the world lit and shadowed, the robot and moving cart live from the blueprint",
        9000,
      );
      await demo.say("The Go2 walks into the room's wall: it stops there", 12000);
      await demo.lookAt([1, -12, 0], [-4, -19, 5]);
      await demo.say("The cart rides its path and shoves the Go2 aside", 4000);
      await demo.click(
        "[data-testid=viewer-overlay] [role=switch], [data-testid=viewer-overlay] input[type=checkbox]",
        500,
      );
      await demo.say("With the robot's lidar on", 15000);
    } finally {
      sim.kill("SIGINT");
      await sim.status;
    }
  },
};

for (const name of which === "all" ? Object.keys(SCENES) : [which]) {
  const scene = SCENES[name];
  if (!scene) throw new Error(`no scene ${name}: ${Object.keys(SCENES).join(", ")}`);
  const demo = await Demo.open(scratch);
  try {
    await scene(demo);
  } catch (error) {
    await demo.page.screenshot({ path: `${outDir}/${name}.failed.png` });
    console.error(`${name}: ${error}`);
  }
  console.log(await demo.finish(`${outDir}/${name}.mp4`));
}
