// The 555 office (src/world/examples_office.ts), saved in World Builder through its API: deno run -A
// tools/examples/office_555.ts [--url <app>] (default: Desktop's install). Then `dwb check --name office_555` and
// `dwb export --name office_555`.
import { office555 } from "../../src/world/examples_office.ts"

const index = Deno.args.indexOf("--url")
const url = index >= 0 ? Deno.args[index + 1] : "http://127.0.0.1:5555/apps/dim-world-builder"
const response = await fetch(`${url}/api/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: office555() }),
})
console.log(response.status, await response.text())
