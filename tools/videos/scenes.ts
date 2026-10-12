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

/** drag the gizmo's center handle (free move / trackball / uniform scale) by (dx, dy) pixels */
async function dragSelected(demo: Demo, dx: number, dy: number, steps = 45) {
  const [x, y] = await demo.itemOnScreen(await selectedId(demo));
  await demo.drag([x, y], [x + dx, y + dy], steps);
}

const SCENES: Record<string, (demo: Demo) => Promise<void>> = {
  async "1_import_and_cook"(demo) {
    const glb = flag("glb");
    if (!glb) throw new Error("--glb <file> is needed for the import video");
    await fresh(demo, "import_demo");
    await demo.say("Import a 3D model: a CC0 armchair from Poly Haven (.glb)", 1800);
    await demo.clickText("Import a GLB…");
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
    await demo.lookAt([0, 0, 0.5], [-1.6, -2.2, 1.6]);
    await demo.say(
      "The lidar and camera see the real shape; physics uses the convex decomposition",
      3000,
    );
    await demo.click("[data-testid=show-collision]");
    await demo.say("Collision off: the model as it looks", 2000);
  },

  async "2_add_move_rotate_scale"(demo) {
    await fresh(demo, "transform_demo");
    await demo.lookAt([0, 0, 0.5], [-5, -7, 5]);
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
    await dragSelected(demo, 90, -60);
    await dragSelected(demo, -40, 30);
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
    await dragSelected(demo, 80, -50);
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
    await demo.lookAt([1.2, 0, 0.6], [-2.5, -4.5, 3]);
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
    await demo.click("[data-testid=open-risers]");
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
    await demo.lookAt([0, 0, 0], [-9, -11, 7]);
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
    await demo.lookAt([0, 0, 0], [-6, -8, 6]);
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
    await dragSelected(demo, 70, -40, 25);
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
    await demo.lookAt([0, 0, 1.5], [-9, -12, 9]);
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
    await demo.lookAt([0, 0, 1], [-6, -9, 8]);
    await demo.say("Rooms: walls, doors and a ceiling in one item", 800);
    await addFromPalette(demo, "build:room");
    await demo.say("Width and depth", 300);
    await demo.slide("Width (x)", 20);
    await demo.slide("Depth (y)", 15);
    await demo.say("Height", 300);
    await demo.slide("Height", -8);
    await demo.say("Ceiling off and on", 300);
    await demo.click("[data-testid=room-ceiling]", 1200);
    await demo.click("[data-testid=room-ceiling]", 900);
    await demo.say("Add a door and move it along the wall", 300);
    await demo.clickText("Add a door");
    await demo.slide("Offset", 15);
    await demo.slide("Door width", 6);
    await demo.say("Resize with the scale gizmo too", 300);
    await demo.page.keyboard.press("r");
    await dragSelected(demo, 80, -50);
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
    await demo.lookAt([0, 0, 0], [-5, -8, 7]);
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
