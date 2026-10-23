# Scene Review prototype

The `?workspace=review` workspace loads a saved Blender reconstruction without
normalizing its geometry through the asset cooker. It preserves original metre
coordinates, whole-building structure and source object IDs. The original World
Builder remains at the app root.

## Install on another computer

The shared prototype is on `Nabla7/dim-world-builder`, branch
`pim/feat/scene-review`. Use [DimOS Desktop `v0.2.217`](https://github.com/jeff-hykin/dimos-desktop-mirror/releases/tag/v0.2.217),
its dimcode agent, Nix and the separately supplied office review bundle.
Office photographs, Blender files and the MCAP are **not** in this public repo.
Desktop `v0.2.221` and World Builder `v0.2.0` changed gateway routes after this
prototype's base. Compatibility with those new routes has not been verified;
do not silently substitute the latest Desktop release for the tested one.

```sh
# Use a separate profile so this prototype does not replace an existing app.
export DIMOS_HOME="$HOME/.dimos-scene-review"
dimos-desktop install github.com/Nabla7/dim-world-builder --ref pim/feat/scene-review
export DIM_SCENE_REVIEW_BUNDLE="/absolute/path/to/scene-review-v11"
dimos-desktop serve --no-service
```

Open `http://127.0.0.1:5555/?app=dim-world-builder#/?workspace=review`.
The bundle directory must contain `scene.json`, `scene.glb`, `evidence.json`,
`textures/` and `views/`. Configure the agent/model credentials in Desktop on
this computer; another person's credentials are not included. If Desktop is
already using its default port, stop that instance before starting this profile.

Start with a named view, **Walk**, select an object, draw/attach a photograph,
then **Share view with agent**. The standalone setup below supports review and
saved feedback without Desktop chat. This is a prototype for reviewing a Blender
reconstruction with an agent; it is not yet a complete drag-and-drop interior
design editor or an automatic, verified Blender editing workflow.

To author changes, also obtain the source `.blend` and its textures (or a packed
copy). Set `source_blend` in the transferred bundle's `scene.json` to that file's
absolute local path. Preserve its `source_sha256`; moving a file does not change
its content hash. The raw MCAP is not needed for walkthrough or review.

## Desktop conversation — 2026-10-22

The review now shares Desktop's existing dimcode conversation. Open
`http://127.0.0.1:5555/?app=dim-world-builder#/?workspace=review` on this Mac,
then **Talk with agent**. Select a surface, draw or attach a photo, and use
**Share view with agent** to send the description together with a frozen view.
Continue the conversation in Desktop's chat while exploring the building.

The agent receives current selection, metric camera/point and recording time
through Desktop's context tool. A message about **View 1** stays attached to
that saved view even after the user moves elsewhere. Image endpoints supply
the annotated screenshot, recording reference and attached photo. The agent
can move the viewer to a source camera, object, saved view or floor; it must
check the browser's acknowledgement before saying the change was applied.

This uses Desktop's native chat portal and dimcode gateway. There is no second
chat service and no change to Desktop core, DimOS or sim2. Chat history,
model selection, tool execution and interruption belong to dimcode. This Codex
conversation is not automatically migrated into it. Relevant scene instructions
and durable review context are available independently of the conversation.

### Local installation

Verified with Desktop `v0.2.217` and dimcode's `desktop-agent-v0.1.5` release
(CLI reports `0.1.0-next.7`), downloaded from their official GitHub releases and
checked against release SHA-256 sums. The isolated profile is
`/Users/pimvandenbosch/.dimos-scene-review`. Its app link points to this checkout;
the usual `~/.dimos` profile is untouched. Desktop's existing credential store
uses the OpenAI key already configured for DimOS; no key is stored in this repo.

Start the installed local prototype with:

```sh
DIMOS_HOME=/Users/pimvandenbosch/.dimos-scene-review \
DIM_SCENE_REVIEW_BUNDLE=/Users/pimvandenbosch/Desktop/sf-555-office/exports/scene-review-v11 \
  .data/desktop/bin/dimos-desktop-aarch64-apple-darwin serve --no-service
```

After changing the app, run `nix build .#dimosApp`, then POST
`http://127.0.0.1:5555/api/apps/dim-world-builder/reload`. The binaries, profile,
capture and derived assets are local and untracked. Native chat sends selected
context/images to its configured model; the raw MCAP and whole asset bundle
are not uploaded by this integration.

### Publishing a scene revision

Keep V11 immutable. An authoring agent uses its normal file/command tools to
save a new `.blend` and run `tools/review/export_blender.py --revision NAME`
through Blender into a new directory. Copy the current `evidence.json` and
`views/` into that directory to retain the calibrated recording references.
Derived revisions hide old Cycles stills. Set `evidence.render_source_sha256`
to the new source hash only after regenerating those stills from that source.

POST `api/review/open` with `{ "bundleDir": "/absolute/export/directory",
"expectedRevision": "V11" }`. The backend checks the current revision,
project identity/frame and manifest, then the browser loads the export while
preserving the viewpoint. The header's revision picker restores older exports.
The app stores its active directory/history in `dataDir/review-revisions.json`;
notes stay associated with their original revision. An old saved view requires
opening its revision before restoration.

This is a verified publication/reload/rollback handoff, not a verified autonomous
Blender authoring job. It does not validate visual accuracy, imported geometry
integrity or MuJoCo collisions. A full actual Blender edit-and-review cycle,
job progress/cancellation and variant acceptance remain to be exercised.

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
Blender. Inside Desktop, sharing also sends a message to dimcode. The standalone
viewer saves feedback without launching an agent. Authoring is a separate tool
action; completed exports can be published through the revision handoff above.

## Export the reviewed baseline

Use the saved V11 file, not the reconstruction builder's current source (which
also contains unfinished V12 edits):

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background /path/to/sf555_office_v11.blend --disable-autoexec --python-exit-code 1 \
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
and Blender box-projection mapping, UV-mapped labels and alpha-over color mixes. Unsupported color nodes
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
Agent readiness uses the declared `@desktop-gateway` API. Opening/sending chat
uses Desktop's existing shell prompt message with `keepOpen: true`. The review
declares one image `x-dimos-role: view` endpoint and view/publication endpoints;
no new command topics were added. The standalone review skips Desktop's
URL-event subscription; the installed path retains it.

This prototype is installed locally, not a published Desktop app release. MuJoCo visual/collision
cooking, hinged-door interaction, controller launch, Blender revision jobs,
variant acceptance and lighting bakes remain unfinished. Existing World Builder
MuJoCo export still has its pre-existing metadata compatibility limits; this
review workspace does not route the office through that exporter.

## Experimental Cycles lighting bake

The branch includes an opt-in static diffuse-lighting exporter and viewer.
It bakes direct/indirect Cycles illumination into a second UV set, retains the
original photographic color textures, and samples Blender's display transform.
The default V11 bundle continues using the original browser lighting.

**Status after the full-building trial:** 32 atlases now cover 11,827 diffuse
receivers. Geometry and browser interaction checks pass, but visual review still
shows mottled chair upholstery/cabinet faces and excessively dark lounge chairs.
This is **not visually accepted or deployed as the default**. The working V11
bundle remains available for the office-design handoff. Do not present the bake
as finished Cycles fidelity.
The baker currently targets Blender on Apple Silicon: Metal and Blender's bundled
OpenImageDenoise dylib. Other platforms are unverified.

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background /path/to/sf555_office_v11.blend --disable-autoexec --python-exit-code 1 \
  --python tools/review/bake_lighting.py -- \
  --out /path/to/new-lighting-pilot --baseline /path/to/scene-review-v11 --pilot
node tools/review/verify_baked_geometry.mjs \
  /path/to/scene-review-v11 /path/to/new-lighting-pilot
```

Omit `--pilot` only after checking visual quality and resource use. Keep the
baseline and source immutable; the exporter writes a separate bundle. Completed
atlas/UV caches allow retrying the same bake. Packing retries smaller margins
and rejects cached UVs outside a single texture tile. Denoising uses geometric
normal and coverage guides; photographic color maps stay separate. Linear EXRs
use half-float ZIP storage, and supported browsers use packed R11G11B10 lighting
textures to halve GPU texture storage. Static lighting needs rebaking after
changes to geometry or lights. Glass and view-dependent reflections remain
approximate; movable objects need a different lighting treatment.

The full-building export retained all 12,008 object IDs and 1,781,784 triangles,
with maximum vertex displacement of `1.1e-6` metres. The source SHA-256 is unchanged.
This checks export geometry, not reconstruction accuracy, lighting quality or
physical collision behavior. `verify_baked_geometry.mjs` repeats this check and
validates the secondary UV coordinates. The trial loaded in 42.04 seconds and
ran at 58.6–59.3 FPS across six recorded viewpoints on this M4 Max with Chrome/Metal
at 1600×1000 (1024×576 canvas). Whole-building cutaway reported 60 FPS in a short
sample. Estimated mipmapped packed-lighting storage is 1,136.7 MiB, excluding
geometry and color textures; this is not measured resident memory. Picking,
drawing, comparison, attached photos, saved feedback/reload, navigation and both
floor cutaways passed against this bundle. Those functional checks do not
override the failed visual acceptance.

[Full-building trial evidence](evidence/scene-review-lighting-2026-10-22.json).

### Installed Desktop results — 2026-10-22

The native Desktop window loaded all V11 objects and opened its real dimcode
chat. With `openai/gpt-6-astra`, a real request identified the selected
`Island_front_panel`, inspected its kitchen recording at second 580, and
moved the viewer to Reception at second 124. The saved View 1 retained its
original selection/camera, the browser acknowledged the command, and dimcode's
persisted final response confirmed completion. No geometry was edited.

Type checks, backend state/concurrency/revision tests, 35 existing tests,
Nix build and Desktop `app check . --run` pass. An isolated browser test loaded
a manifest-only derived revision, preserved the camera, survived a page reload
and restored V11 through the revision picker, without uncaught page errors.
This test uses the same geometry; it does not establish a Blender edit cycle.

```sh
node tools/review/verify_handoff.mjs /path/to/scene-review-v11
# Optional real inference; requires the configured Desktop profile running.
# Saves a shared view and uses the model's configured credentials.
RUN_LIVE_AGENT=1 node tools/review/verify_desktop.mjs
```

[Recorded evidence](evidence/scene-review-desktop-2026-10-22.json).

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
