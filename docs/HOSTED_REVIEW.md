# Hosted Scene Review

One shared project can live on a Linux GPU host. People take turns editing it
through the browser; simultaneous independent agent editing is not implemented.
Each browser draws the interactive preview locally. The host stores the Blender
master, browser export, feedback, revisions, renders and Desktop agent state.

## Using it

1. Open the supplied Desktop link and enter the workspace password supplied by
   the operator. The Anvil pilot is accessible over public HTTPS; visitors do
   not need Tailscale, Blender, or a local app installation.
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

The owner accepted a temporary Cloudflare Quick Tunnel after Tailscale Funnel
was rejected on the current Starter plan. The public route is now active and
tested. The URL lasts while that tunnel process runs: recreating it, including
after a host reboot, produces a different hostname. Automatic service restart
restores access under a new address, not the old link. There is no uptime
guarantee or fixed expiry date. No Cloudflare account or domain was needed.
See [Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

### Temporary public route

Cloudflared forwards to Caddy on `127.0.0.1:5560`. Caddy sends main-origin
requests to Desktop port 5555 and public HTTPS port 8443 requests to Desktop's
separate shell port 13555. Both use the same public hostname, preserving the
8000 port offset and one native Desktop password login. Public port 8443 is
handled at Cloudflare's edge; no additional host listener is installed there.

Both Caddy upstreams must use the host's **non-loopback address**. Desktop
bypasses authentication for loopback peers, so proxying directly to
`127.0.0.1:5555` would expose the workspace without its password. The Caddy
configuration adds `Secure` to the native HttpOnly session cookie and marks
responses `private, no-store`. The separate shell origin remains intact.

Deployment templates are in [`deploy/public`](../deploy/public). Install the
Caddyfile at `/etc/sf555-public/Caddyfile`, and both service units in
`/etc/systemd/system`. The pilot uses root-owned, executable binaries
`/opt/sf555-public/bin/caddy` (**2.11.7**) and
`/opt/sf555-public/bin/cloudflared` (**2026.10.3**), downloaded from their
official releases and checked against release SHA-256 digests. The units run
as the dedicated `sf555` account, depend on `sf555-office.service`, and are
enabled at boot. Each proxy/tunnel service is capped at 256 MiB RAM.

Set these non-secret values in `/etc/sf555-public/office.env`, substituting the
host's actual non-loopback address:

```sh
SF555_DESKTOP_ADDRESS=100.x.y.z
SF555_MAIN_PORT=5555
SF555_SHELL_PORT=13555
```

After installing the files and validating the Caddy configuration:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now sf555-public-proxy.service sf555-public-tunnel.service
sudo systemctl status sf555-public-proxy.service sf555-public-tunnel.service
sudo journalctl -u sf555-public-tunnel.service -n 60 --no-pager
```

Cloudflared prints the current `https://….trycloudflare.com` address in its
startup journal. Append `/?app=dim-world-builder#/?workspace=review` to open the
office. Share the password separately; neither it nor the provider key belongs
in deployment templates. Stop `sf555-public-tunnel.service` to close public
access without stopping the office or robot services. Avoid restarting it
merely to check status, since a restart changes the shared link.

Public-route acceptance passed in a fresh browser: password login, complete
office loading, saved Cycles images, a live scene-context agent turn, and the
separate shell WebSocket. Anonymous scene, agent, MCP and shell requests return
401 on both origins; the local-token route returns 403. Private mesh and image
URLs remain inaccessible anonymously after an authenticated browser loads them.
No new Blender edit or GPU render was requested for this routing check; the
render acceptance below records the earlier hosted checks.

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
