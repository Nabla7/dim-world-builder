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
        objects: [{ id: "Measured_floor", collection: "shell", min: [0, 0, 0], max: [3, 4, .2] }],
        limitations: ["No collision certification"],
      }),
    );
    await Deno.writeTextFile(
      `${bundle}/evidence.json`,
      JSON.stringify({ views: [{ second: 580 }] }),
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
      const bad of [{ ...focus, revision: "V12" }, { ...focus, objectId: "fake" }, {
        ...focus,
        sourceSecond: 999,
      }, { ...focus, point: [1, null, 2] }]
    ) {
      assert(
        (await call("/api/review/notes", { ...bad, text: "bad" })).status === 400,
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
    assert(responses.every((r) => r.status === 201), "concurrent writes accepted");
    const saved = await (await call("/api/review/notes")).json();
    assert(saved.length === 12, "no lost concurrent writes");
    assert(
      saved.every((n: { sourceSecond: number; point: number[] }) =>
        n.sourceSecond === 580 && n.point[2] === .2
      ),
      "calibration/point retained",
    );
    const id = saved[0].id;
    assert((await call("/api/review/notes/status", { id, status: "resolved" })).ok, "resolve");
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
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
