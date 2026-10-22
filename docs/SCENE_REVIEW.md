# Scene Review prototype

The `?workspace=review` workspace loads a saved Blender reconstruction without
normalizing its geometry through the asset cooker. It preserves original metre
coordinates, whole-building structure and source object IDs. The original World
Builder remains at the app root.

## Run locally

Requires Deno and a prepared review bundle. From this repository:

```sh
deno install --frozen
deno task build
deno run -A backend/main.ts --port 8797 --review /path/to/scene-review-v11
```

Open `http://127.0.0.1:8797/?workspace=review`. The standalone backend binds only
to loopback. For UI development, keep the backend running and use
`API_PORT=8797 deno task dev --host 127.0.0.1`.

The current local SF555 bundle is
`/Users/pimvandenbosch/Desktop/sf-555-office/exports/scene-review-v11`.
The bundle and private recording are not committed or uploaded. Feedback lives
in the app's `dataDir/review/<bundle-id>/`, or `.data/review/` outside Desktop.

## Try it

- Pick a named recording view. All 360 views are available; 76 have existing
  Cycles renders. The initial kitchen view is recording second 580.
- **Walk:** focus the canvas, use W/A/S/D, Q/E for height and right-drag to look.
  Shift moves faster. This is free-camera inspection, not simulated walking.
- **Whole building / Ground / Upper:** inspect the original geometry with a
  horizontal cutaway. **Cut roof** toggles the cutaway without editing geometry.
- **Compare:** swipe between the undistorted recording and the existing Cycles
  render at the same camera. Views without a Cycles render compare against the
  interactive preview. **Blender still** explicitly displays a still image.
- Click an object in the walkthrough, draw on the view, attach a PNG/JPEG photo
  and save feedback. A note stores source object ID, project XYZ point, camera,
  source second, cut height, revision, normalized drawing and screenshot.
- Click a saved note to restore its viewpoint and drawing. Resolve/reopen tracks
  review state. **Export feedback** downloads the aggregate agent context.

Source comparison is enabled only at a recorded camera. Moving the camera exits
comparison. Drawings are view-specific, not geometric constraints. Attachments
and notes persist; merely selecting an object or saving a note never modifies
Blender. **There is no autonomous edit/rebuild/apply loop in this prototype.**
An authoring agent can read `GET api/context` or `GET api/review/context` and
perform the next source revision as a separate action.

## Export the reviewed baseline

Use the saved V11 file, not the reconstruction builder's current source (which
also contains unfinished V12 edits):

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background /path/to/sf555_office_v11.blend --disable-autoexec \
  --python tools/review/export_blender.py -- --out /path/to/scene-review-v11
/path/to/dimos/.venv/bin/python tools/review/prepare_evidence.py \
  /path/to/sf-555-office /path/to/scene-review-v11
```

The export is a derived artifact. It does not save the loaded `.blend`. Evaluated
mesh and curve geometry becomes glTF, including source IDs and collection names.
The glTF Y-up conversion is inverted exactly once by the viewer. Static batching
preserves triangle-to-source-object ranges for picking. The scene is never
recentered, rescaled or reduced to generic room primitives.

The material sidecar preserves the existing image textures, affine world-space
mapping, UV-mapped labels and alpha-over color mixes. Unsupported color nodes
are listed in `scene.json.warnings`; procedural bump and Cycles lighting are
not baked. Browser lighting and transparent glass remain approximate. Original
RGB stays RGB: PIL decodes/saves, and OpenCV only undistorts channels using the
recorded K/D with unchanged K. Comparison uses asymmetric pinhole intrinsics.

## Desktop contract and boundaries

This extends Jeff's World Builder (`647c8f19cf0886a4df93633bbc1ec9fbdc5390bd`),
reusing its Deno backend, React/Three dependencies, Desktop theme provider and
Nix app package. It does not change Desktop core, the DimOS module runtime or
sim2. The existing app contract declares the new routes. One aggregate
`x-dimos-role: context` endpoint replaces the multiple competing context roles.

Desktop starts the same server using `DIMOS_APP` and its Unix socket; set
`DIM_SCENE_REVIEW_BUNDLE` to the local bundle path in the server environment.
Notes go to Desktop's persistent `dataDir`, not its replaceable app checkout.
No external app calls or command topics were added. The standalone review skips
Desktop's URL-event subscription; the installed path retains it.

This prototype is not an installed Desktop release. MuJoCo visual/collision
cooking, hinged-door interaction, controller launch, Blender revision jobs,
variant acceptance and lighting bakes remain unfinished. Existing World Builder
MuJoCo export still has its pre-existing metadata compatibility limits; this
review workspace does not route the office through that exporter.

## Verification

```sh
deno task check
deno task test
deno test -A backend/review_test.ts
deno task build
nix build .#dimosApp
```

`tools/review/verify_browser.mjs` uses Playwright and local Chrome. Run against
an isolated backend data directory, not a user's live feedback store:

```sh
DIMOS_APP='{"dataDir":"/tmp/scene-review-qa"}' \
  deno run -A backend/main.ts --port 8798 --review /path/to/scene-review-v11
node tools/review/verify_browser.mjs
```

It exercises calibrated projection, real-object picking, drawing, comparison,
saving/reopening feedback, reload persistence, keyboard navigation, multiple
areas, floor cutaways and narrow layouts. Evidence and screenshots go to ignored
`.data/qa/`. Numerical camera checks establish projection consistency, not
reconstruction accuracy or collision validity. Report frame rates with the
viewpoint, browser and viewport: they are not a universal performance guarantee.

### Local results — 2026-10-21

The V11 export contains all 12,008 visible mesh/curve source objects with unique,
matching IDs and 84 image maps. The saved `.blend` SHA-256 is unchanged. Numerical
projection at the kitchen camera agrees within `6e-15` normalized coordinates.
Browser checks cover the workflow above, including an attached photo and context
download. Chrome/Metal at 1600×1000 reported 60–61 FPS across six indoor viewpoints
and 60 FPS for the building cutaway (971 draws, 1.89 million submitted triangles).
These are short local samples, not a frame-time distribution or a device guarantee.

The 35 existing World Builder tests, review persistence/concurrency validation,
TypeScript checks, production build and Nix app build pass. The Desktop CLI is
not installed here, so its `app check` and an installed Desktop window have not
been exercised. The single context role and declared review routes were checked
locally. [Recorded evidence](evidence/scene-review-2026-10-21.json).

The built Nix server also starts through `DIMOS_APP` on a Unix socket and
returns the combined review/project/library context with the expected V11
source hash. The Vite development path loads with no uncaught browser errors.
