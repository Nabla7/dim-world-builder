# Hosted Scene Review

One shared project can live on a Linux GPU host. People take turns editing it
through the browser; simultaneous independent agent editing is not implemented.
Each browser draws the interactive preview locally. The host stores the Blender
master, browser export, feedback, revisions, renders and Desktop agent state.

## Using it

1. Open the supplied Desktop link and enter the workspace password supplied by
   the operator. The current Anvil link still requires Tailscale; public HTTPS
   hosting is pending after Funnel was rejected by the tailnet's Starter plan.
2. Explore the office, select objects, and attach comments or reference photos.
   **Save feedback** works before a model is connected. Once the agent is ready,
   **Share view with agent** also sends that saved context into its conversation.
3. Choose **Render this view** for an actual Blender Cycles image. **Renders**
   holds the shared history, Preview/High quality choice, cancellation and image
   downloads. The camera is captured when the button is clicked; moving afterward
   does not alter the job. Turn off building cutaways before rendering.
4. Use **Talk with agent** or **Share view with agent** to ask for scene changes.
   An operator must first configure an explicitly authorized provider account
   and model through the chat's settings. When this is already configured,
   visitors can start chatting immediately. Render jobs use no LLM credits.

Provider credentials are shared by this Desktop installation, not separately
billed per visitor. Everyone using its agent uses the configured account until
it is removed or changed. Do not copy another installation's credential store.
No provider credentials or private office assets belong in the app repository.
The Anvil pilot currently uses an owner-authorized shared OpenAI account with
`openai/gpt-6-astra`; the owner can switch accounts later in chat settings.
The key is stored by dimcode in its private `auth.json` with mode `0600`.

## Operator setup

The exercised combination is Desktop **v0.2.217**, dimcode release
**desktop-agent-v0.1.5**, and Blender **5.1.1** on Ubuntu with NVIDIA/OptiX.
Use a dedicated OS account and home directory so the agent has no access to
the workstation operator's model credentials or robot worktrees.

The Anvil pilot now has a native Desktop password again. Its main port is 5555,
shell port 13555, and bind address `0.0.0.0`. The former passwordless Tailscale
Serve loopback forwards have been removed. Anonymous scene and agent requests
return 401; `/api/auth/local-token` returns 403 for non-loopback callers.

Public hosting is not yet active. Tailscale Funnel was rejected on the current
Starter plan. A Cloudflare Quick Tunnel is being considered for a temporary
link; its hostname changes when the process is recreated and has no uptime
guarantee. A stable named tunnel requires a Cloudflare account and domain. See
[Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

When adding a public tunnel, preserve Desktop's remote authentication. Desktop
bypasses authentication for loopback peers, so forwarding straight to
`127.0.0.1` would bypass its password even when one is configured. A forwarding
path to the host's non-loopback address was checked to retain authentication.
Public exposure must first verify anonymous rejection for the scene, agent,
WebSocket and shell routes, then authenticated browser operation. Desktop's
separate shell origin also needs correct routing; do not collapse it into the
main origin as a shortcut. No public-route acceptance has been claimed yet.

Install the app with its full URL (the tested Desktop version does not normalize
the shorthand `github.com/...`):

```sh
dimos-desktop install https://github.com/Nabla7/dim-world-builder.git --ref pim/feat/scene-review
```

Unpack the separately supplied project, run its `configure.py`, and configure:

```sh
DIM_SCENE_REVIEW_BUNDLE=/absolute/path/to/project/browser
DIM_SCENE_REVIEW_BLENDER=/absolute/path/to/blender
DIM_SCENE_REVIEW_DEVICE=OPTIX
```

Use a fresh `DIMOS_HOME`, `DIMCODE_HOME` and agent socket for this installation.
The existing Desktop/dimcode integration owns chat, credentials and agent tools;
this app adds no second chat harness. It does not require starting a robot
blueprint or installing the robot control stack to review the office.

Run Desktop under a supervisor with automatic restart and persistent storage.
The pilot uses one GPU render at a time, four Blender CPU threads, and a service
limit of 10 GiB RAM / four CPU cores. Each render has a 15-minute timeout. Adjust
limits after measuring the actual scene and other workstation workloads. GPU
jobs share the device with other software; scheduling this office workload does
not reserve GPU time against robot or training processes.

The starting project is mounted read-only inside the service; author revised
Blender files and exports into a separate writable revisions directory. This
keeps the supplied source available while the agent creates new versions.

Keep the app's data directory and project source/revisions when updating. A
service restart terminates its child jobs; an unfinished render is marked
interrupted on the next load, while finished renders and review notes remain.
The baseline Blender source is copied and hash-checked for each job, then
rendered without saving it. Only the temporary copy is removed afterward.

For updates, use the existing app checkout, build `nix build .#dimosApp`, run
`dimos-desktop app check . --run`, and reload the app through Desktop. Avoid
reloading during an active render unless deliberately cancelling that work.

## Render acceptance

Recorded viewpoints use the original calibrated intrinsics, including principal
point offsets and unequal focal lengths. Free viewpoints use the browser camera
pose, vertical field of view and aspect ratio. Materials, world lighting and
display settings come from the saved Blender scene; per-view exposure changes
and downloaded decorative assets are not part of rendering.

Each saved image includes a JSON companion with source SHA-256, revision,
camera, projection matrix, Blender version, GPU backend, dimensions and samples.
The UI retains older renders under their original revision names; it does not
present them as renders of a newer scene. Browser lighting remains an
approximation and the experimental baked-lighting bundle is not required.

Validation should include anonymous rejection and an authenticated fresh-browser
walkthrough through the actual published route, a calibrated
camera render, a free-camera render, cancellation, retained results after a
service restart, and confirmation that no model account was inherited. A
rendering check does not establish agent editing with an unconfigured account
or certify MuJoCo collisions.
