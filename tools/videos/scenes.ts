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
  // close enough to see what's added (things land where the camera looks: x 2, y 0)
  await demo.lookAt([2, 0, 0.4], [-2.5, -6.5, 4.5]);
}

/** open a saved world from the Open menu */
async function openWorld(demo: Demo, name: string) {
  await demo.app.selectOption("[data-testid=open-world]", { label: name });
  await demo.page.waitForTimeout(2500);
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
    await demo.say("Railings: posts and a rail, a solid panel, or cables", 300);
    await demo.click('[data-testid="stairs-railing"] >> text="Both"', 900);
    await demo.clickText("Solid panel", 1100);
    await demo.clickText("Cables", 1100);
    await demo.clickText("Posts + rail", 900);
    await demo.say("Switchback: two flights back and forth with a landing", 300);
    await demo.click('[data-testid="stairs-style"] >> text="Switchback"', 1500);
    await demo.slide("Steps", 6);
    await demo.say("Spiral: around a center post", 300);
    await demo.click('[data-testid="stairs-style"] >> text="Spiral"', 1500);
    await demo.slide("Turn", 8);
    await demo.slide("Center post", 6);
    await demo.say(
      "Every one exports as MuJoCo boxes and cylinders the robot steps on (and the lidar sees)",
      2500,
    );
  },

  async "4_hills"(demo) {
    await fresh(demo, "hill_demo");
    await demo.say("Hills: natural bumpiness from fractal noise", 1000);
    await addFromPalette(demo, "build:hill");
    await demo.say("Hill height", 300);
    await demo.slide("Hill height", 12);
    await demo.say("Hills per 10 m", 300);
    await demo.slide("Hills per 10 m", 10);
    await demo.say("Small bumps a robot feels", 300);
    await demo.slide("Small bumps", 8);
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
    await demo.moveTo((box?.x ?? 0) + 150, (box?.y ?? 0) + 400);
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
    await demo.say("Cut openings: a door, a double door, a window, a crawl-space hatch, an archway", 300);
    for (const kind of ["door", "double", "window", "crawl", "arch"]) {
      await demo.click(`[data-testid="add-opening-${kind}"]`, 700);
    }
    await demo.say("Then put each on a wall, slide it along, size it", 300);
    const walls = demo.app.locator('[data-testid=inspector] [role=tablist], [data-testid=inspector] [role=radiogroup]');
    void walls;
    for (const [index, wall] of [[1, "S"], [2, "E"], [3, "W"], [4, "S"]] as const) {
      const group = demo.app.locator(`[data-testid=inspector] >> text="${["Door", "Double door", "Window", "Crawl hatch", "Archway"][index]}"`).first();
      await group.scrollIntoViewIfNeeded();
      const row = group.locator("xpath=..");
      const box = await row.locator(`text="${wall}"`).first().boundingBox();
      if (box) {
        await demo.moveTo(box.x + box.width / 2, box.y + box.height / 2, 15);
        await demo.page.mouse.down();
        await demo.page.mouse.up();
        await demo.page.waitForTimeout(600);
      }
    }
    await demo.slide("Offset", 12);
    await demo.slide("Opening width", 6);
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
    await demo.page.keyboard.press("Escape");
    await demo.say("Play motion: watch it ride the path, exactly as the simulation will move it", 300);
    await demo.click("[data-testid=preview-motion]", 300);
    await demo.lookAt([1.5, 1.5, 0], [-4, -5, 5]);
    await demo.page.waitForTimeout(9000);
    await demo.say(
      "In the simulation it's a kinematic body: it shoves the robot and lidar sees it",
      2500,
    );
    await demo.click("[data-testid=preview-motion]", 300);
  },

  async "13_office_people"(demo) {
    await openWorld(demo, "office_555");
    await demo.say("The 555 office, rebuilt from its lidar maps with the app's own API", 1200);
    await demo.lookAt([14, 2, 0], [-2, -22, 30]);
    await demo.say("Play motion: four people walk their loops (they're scene movers: the robot must avoid them)", 300);
    await demo.click("[data-testid=preview-motion]", 300);
    await demo.page.waitForTimeout(7000);
    await demo.lookAt([22, 2, 0], [14, -12, 9]);
    await demo.page.waitForTimeout(8000);
    await demo.say("Floor 2", 300);
    await demo.lookAt([5, 2.5, 4.7], [-3, -9, 14]);
    await demo.page.waitForTimeout(7000);
    await demo.click("[data-testid=preview-motion]", 300);
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
      "Exported as scene.json annotations; verify/nav_eval.py runs it on any robot: Twist to walk, PoseStamped goals",
      4000,
    );
  },

  async "11_holes_and_apriltags"(demo) {
    await fresh(demo, "holes_tags_demo");
    await demo.say("Holes in the floor: the ground floor is a thick slab", 800);
    await addFromPalette(demo, "build:hole");
    await demo.slide("Size X", 15);
    await demo.slide("Depth", 6);
    await demo.say("A pit keeps a bottom; deeper than the slab cuts all the way through", 1500);
    await demo.page.keyboard.press("Escape");
    await demo.say("AprilTags: tag36h11, 10 cm, on any wall", 600);
    await addFromPalette(demo, "build:room");
    await dragSelected(demo, 0, -160);
    await demo.page.keyboard.press("Escape");
    await demo.click('[data-testid="add-tool:apriltag"]', 600);
    await demo.say("Click a wall: each click sticks the next tag id there, facing out", 300);
    const room = await demo.state<number[]>("s.project.items.find(i => i.kind === 'room').position");
    for (const dx of [-1.5, 0, 1.5]) {
      const [sx, sy] = await demo.worldToScreen(room[0] + dx, room[1] - 2.6, 1.3);
      await demo.moveTo(sx, sy, 18);
      await demo.page.mouse.down();
      await demo.page.mouse.up();
      await demo.page.waitForTimeout(700);
    }
    await demo.click("[data-testid=tag-tool-done]");
    await demo.say("Exported as textured meshes: MuJoCo's camera sees them and OpenCV decodes them", 3000);
  },

  async "9_viewer_mode"(demo) {
    // the playground (made with the CLI: dwb generate --kind playground), exported from the app, then a simulated Go2
    // driven through its nav test by verify/nav_eval.py while the app watches in Viewer mode
    await openWorld(demo, "playground");
    await demo.say("The playground world, generated with the dwb CLI", 1500);
    await demo.click("[data-testid=export]", 800);
    await demo.click("[data-testid=export-go]");
    await demo.app.waitForSelector("[data-testid=export-result]", { timeout: 60000 });
    const dir = (await demo.app.locator("[data-testid=export-result] b").first().textContent())!.trim();
    await demo.say(`Exported to ${dir}`, 2000);
    await demo.clickText("Done");
    const python = flag("python") ?? `${Deno.env.get("HOME")}/repos/dimos_sim2/.venv/bin/python`;
    const sim = new Deno.Command(python, {
      args: [
        new URL("../../verify/nav_eval.py", import.meta.url).pathname,
        dir,
        "--blueprint",
        "unitree-go2-freewalk",
        "--report",
        `${outDir}/playground_nav_eval.json`,
      ],
      env: { PYTHONPATH: "" },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    // its output goes to a log beside the video, for when the run dies early
    const log = await Deno.open(`${outDir}/playground_nav_eval.log`, { write: true, create: true, truncate: true });
    const copy = async (stream: ReadableStream<Uint8Array>) => {
      for await (const chunk of stream) await log.write(chunk);
    };
    const logged = Promise.all([copy(sim.stdout), copy(sim.stderr)]);
    try {
      await demo.say("nav_eval.py starts a simulated Go2 (dimos sim2) in the export and walks its mapping path…", 400);
      await demo.click('[data-testid=mode] >> text="Viewer"', 500);
      await demo.lookAt([-4, -2, 0], [-16, -18, 12]);
      await demo.say("Viewer mode: the world lit and shadowed; the Go2 and the moving cart and drum live from the sim", 15000);
      await demo.say("The drum circles the building; the cart rides the corridor", 12000);
      await demo.click("[data-testid=viewer-overlay] label", 500);
      await demo.say("With the robot's lidar on", 15000);
      await demo.lookAt([2, 2, 0], [-10, -12, 9]);
      await demo.say("Walking the mapping path before the goals", 20000);
    } finally {
      // the run may already have ended (its report is written, or it crashed: see the log)
      try {
        sim.kill("SIGINT");
      } catch {
        // already exited
      }
      await sim.status;
      await logged;
      log.close();
    }
  },

  async "12_grates_lights_views"(demo) {
    await fresh(demo, "grates_lights_views_demo");
    await demo.say("Drain grates: a hole with bars flush with the floor", 800);
    await addFromPalette(demo, "build:grate");
    await demo.lookAt([0, 0, 0], [-2.5, -3, 2.5]);
    await demo.slide("Gap between bars", 6);
    await demo.say("Slats, or a grid; bar width, gap and depth are sliders", 600);
    await demo.clickText("Grid", 1500);
    await demo.slide("Bar width", 4);
    await demo.say("Every bar collides: lidar sees through the gaps, feet can catch", 2000);
    await demo.page.keyboard.press("Escape");
    await demo.say("Lights: bulbs, spots and suns, exported as MuJoCo lights", 600);
    await addFromPalette(demo, "build:light");
    await demo.clickText("Spot", 800);
    await demo.slide("Brightness", 8);
    await demo.say("Color, brightness, reach, cone and shadows", 2000);
    await demo.page.keyboard.press("Escape");
    await demo.clickText("Views", 800);
    await demo.lookAt([0, 0, 0], [3, -4, 3]);
    await demo.say("Saved camera views, for agents checking a task from a fixed spot", 600);
    await demo.click("[data-testid=save-view]", 1200);
    await demo.lookAt([0, 0, 0], [-8, 6, 9]);
    await demo.say("Jump back to a saved view any time", 600);
    await demo.click('[data-testid^="view-"]', 2500);
    await demo.say("Each view exports as a MuJoCo camera; render_view() and api/views/image give its picture", 3000);
  },

  async "0_playground_tour"(demo) {
    await openWorld(demo, "playground");
    await demo.say("A playground made in one command: dwb generate --kind playground", 2500);
    const shots: [[number, number, number], [number, number, number], string][] = [
      [[0, 0, 1], [-14, -16, 12], "A two-floor building: a lab downstairs, an office upstairs, stairs up its side"],
      [[0, 0, 1.5], [-3.5, -2.5, 2.2], "Inside the lab: furniture from the library, AprilTags on the walls, windows"],
      [[4, 12, 1], [-6, 6, 6], "A corridor with a cart riding through it"],
      [[-12, 10, 1.5], [-17, 4, 5], "A spiral stair tower"],
      [[-16, -12, 0], [-24, -22, 9], "A bumpy hill, clutter fields, pits"],
      [[13, -13, 1], [8, -19, 5], "A switchback with cable railings"],
    ];
    for (const [target, from, caption] of shots) {
      await demo.lookAt(target, from);
      await demo.say(caption, 3500);
    }
    await demo.clickText("Nav test");
    await demo.lookAt([2, 0, 0], [-10, -18, 18]);
    await demo.say("Its nav test: a mapping walk (dashed), then three goals (flags)", 4000);
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
