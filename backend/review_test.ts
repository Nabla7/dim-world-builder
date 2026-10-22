import { reviewRoutes } from "./review.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
Deno.test("review notes preserve calibrated context, serialize concurrent writes and survive restart", async () => {
  const root = await Deno.makeTempDir();
  try {
    const bundle = `${root}/bundle`, data = `${root}/data`;
    await Deno.mkdir(bundle);
    await Deno.writeTextFile(
      `${bundle}/scene.json`,
      JSON.stringify({
        id: "fixture-v11",
        revision: "V11",
        units: "metres",
        up: "Z",
        geometry: "scene.glb",
        source_blend: "/fixture/baseline.blend",
        source_sha256: "baseline-fixture-sha",
        objects: [{
          id: "Measured_floor",
          collection: "shell",
          min: [0, 0, 0],
          max: [3, 4, .2],
        }],
        limitations: ["No collision certification"],
      }),
    );
    await Deno.writeTextFile(`${bundle}/scene.glb`, "geometry handoff fixture");
    await Deno.writeTextFile(
      `${bundle}/evidence.json`,
      JSON.stringify({
        views: [{ second: 580, render: "views/baseline.jpg" }],
      }),
    );
    let handler = reviewRoutes(bundle, data);
    const call = async (path: string, body?: unknown) => {
      const url = new URL(`http://localhost${path}`);
      return (await handler(
        new Request(
          url,
          body === undefined ? undefined : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
        url,
      ))!;
    };
    const focus = {
      revision: "V11",
      camera: {
        position: [1, 2, 6],
        quaternion: [0, 0, 0, 1],
        target: [1, 3, 6],
        fov: 65,
        aspect: 16 / 9,
      },
      sourceSecond: 580,
      objectId: "Measured_floor",
      point: [1, 2, .2],
      cutHeight: 100,
      mode: "compare",
    };
    assert((await call("/api/review/focus", focus)).ok, "valid focus");
    for (
      const bad of [{ ...focus, revision: "V12" }, {
        ...focus,
        objectId: "fake",
      }, {
        ...focus,
        sourceSecond: 999,
      }, { ...focus, point: [1, null, 2] }]
    ) {
      assert(
        (await call("/api/review/notes", { ...bad, text: "bad" })).status ===
          400,
        "reject stale/invalid context",
      );
    }
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        call("/api/review/notes", {
          ...focus,
          text: `Note ${i}`,
          strokes: [{ points: [[.2, .3], [.5, .7]] }],
        })),
    );
    assert(
      responses.every((r) => r.status === 201),
      "concurrent writes accepted",
    );
    const saved = await (await call("/api/review/notes")).json();
    assert(saved.length === 12, "no lost concurrent writes");
    assert(
      new Set(saved.map((n: { number: number }) => n.number)).size === 12,
      "shared view numbers are stable and unique",
    );
    assert(
      saved.every((n: { sourceSecond: number; point: number[] }) =>
        n.sourceSecond === 580 && n.point[2] === .2
      ),
      "calibration/point retained",
    );
    const id = saved[0].id;
    assert(
      (await call("/api/review/notes/status", { id, status: "resolved" })).ok,
      "resolve",
    );
    handler = reviewRoutes(bundle, data);
    const after = await (await call("/api/review/notes")).json();
    assert(
      after.length === 12 && after[0].status === "resolved",
      "notes persist across backend restart",
    );
    const context = await (await call("/api/review/context")).json();
    assert(
      context.notes.length === 12 && context.focus === null,
      "persist notes; do not resurrect stale live focus",
    );
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=";
    assert(
      (await call("/api/review/focus", { ...focus, screenshot: png })).ok,
      "capture current view",
    );
    const captured = await call("/api/review/view");
    assert(
      captured.headers.get("content-type") === "image/png",
      "MCP receives an image response",
    );
    await captured.arrayBuffer();
    const shared = await (await call("/api/review/notes", {
      ...focus,
      text: "Discuss this",
      screenshot: png,
    })).json();
    await call("/api/review/focus", { ...focus, objectId: null, point: null });
    const frozen = await (await call("/api/review/context")).json();
    assert(
      frozen.focus.objectId === null &&
        frozen.latestSharedView.objectId === "Measured_floor",
      "shared view survives subsequent camera/selection changes",
    );
    const noteImage = await call(`/api/review/view?noteId=${shared.id}`);
    assert(noteImage.ok, "saved view remains visible to the agent");
    await noteImage.arrayBuffer();
    assert(
      (await call("/api/review/view", { objectId: "invented" })).status === 400,
      "reject invented source object",
    );
    const queued = await (await call("/api/review/view", { sourceSecond: 580 }))
      .json();
    assert(
      queued.applied === false,
      "queuing a view is not reported as an applied change",
    );
    assert(
      (await call("/api/review/updates", { id: "old-command" })).status === 409,
      "reject acknowledgement of a superseded command",
    );
    await call("/api/review/updates", { id: queued.id });
    assert(
      (await (await call("/api/review/updates")).json()).command.applied ===
        true,
      "browser acknowledgement is observable",
    );
    assert(
      (await call("/api/review/notes", {
        ...focus,
        text: "wrong image",
        attachment: "data:image/svg+xml;base64,AA==",
      })).status === 400,
      "reject active image format",
    );
    assert(
      (await call("/api/review/notes", {
        ...focus,
        text: "bad drawing",
        strokes: [{ points: [[1.1, 0]] }],
      })).status === 400,
      "reject invalid drawing",
    );
    const traversal = new URL("http://localhost/files/review/..%2Fsecret");
    assert(
      (await handler(new Request(traversal), traversal))?.status === 400,
      "reject encoded traversal",
    );
    const derived = `${root}/derived`;
    await Deno.mkdir(derived);
    const baseline = JSON.parse(
      await Deno.readTextFile(`${bundle}/scene.json`),
    );
    await Deno.writeTextFile(
      `${derived}/scene.json`,
      JSON.stringify({
        ...baseline,
        revision: "V11-edit",
        source_blend: "/fixture/derived.blend",
      }),
    );
    await Deno.copyFile(`${bundle}/scene.glb`, `${derived}/scene.glb`);
    await Deno.copyFile(`${bundle}/evidence.json`, `${derived}/evidence.json`);
    assert(
      (await call("/api/review/open", {
        bundleDir: derived,
        expectedRevision: "wrong",
      })).status === 409,
      "reject stale publication",
    );
    assert(
      (await call("/api/review/open", {
        bundleDir: derived,
        expectedRevision: "V11",
      })).ok,
      "open a derived revision",
    );
    let updates = await (await call("/api/review/updates")).json();
    assert(
      (await (await call("/api/review/bundle")).json()).evidence.views[0]
        .render === null,
      "do not present old Cycles stills as a newly edited scene",
    );
    assert(
      updates.revision === "V11-edit" && updates.command.reload &&
        !updates.command.applied,
      "browser must acknowledge reload",
    );
    assert(
      (await call("/api/review/view", { noteId: shared.id })).status === 400,
      "do not acknowledge restoring a view from a different revision",
    );
    handler = reviewRoutes(bundle, data);
    updates = await (await call("/api/review/updates")).json();
    assert(
      updates.revision === "V11-edit" && updates.revisions.length === 2,
      "active revision and undo survive restart",
    );
    assert(
      (await call("/api/review/open", {
        bundleDir: bundle,
        expectedRevision: "V11-edit",
      })).ok,
      "restore original revision",
    );
    assert(
      (await (await call("/api/review/bundle")).json()).revision === "V11",
      "baseline restored",
    );
    assert(
      (await (await call("/api/review/bundle")).json()).evidence.views[0]
        .render === "views/baseline.jpg",
      "baseline stills return with the baseline revision",
    );
    await Deno.writeTextFile(
      `${derived}/scene.json`,
      JSON.stringify({
        ...baseline,
        revision: "mutated",
        source_sha256: "changed-baseline",
      }),
    );
    assert(
      (await call("/api/review/open", {
        bundleDir: derived,
        expectedRevision: "V11",
      })).status === 400,
      "do not accept an overwritten source baseline",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
