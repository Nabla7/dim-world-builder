// dwb: World Builder from the shell, one subcommand per public endpoint in dimos.yaml (the app's OpenAPI-style
// contract), so it stays in step with the server. Talks to the app through Desktop.
//   deno run -A tools/dwb.ts --help
//   deno run -A tools/dwb.ts generate --kind playground --name my_playground --seed 3
//   deno run -A tools/dwb.ts project-items --name my_playground --items '[{"kind":"primitive","params":{"shape":"box","color":[1,0,0]},"position":[2,0,0]}]'
//   deno run -A tools/dwb.ts export --name my_playground --parentDir ~/dimos_worlds
// A value starting with @ is read from that file; JSON values (objects, arrays, numbers) are parsed.
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { parse } from "jsr:@std/yaml@1";

interface Endpoint {
  method: string;
  path: string;
  description: string;
  params?: Record<string, { type: string; description: string }>;
}

const here = new URL("..", import.meta.url);
const yamlText =
  await (here.protocol === "file:"
    ? Deno.readTextFile(new URL("dimos.yaml", here))
    : (await fetch(new URL("dimos.yaml", here))).text());
const contract = parse(yamlText) as { provides: { endpoints: Endpoint[] } };

/** "POST api/project/items" -> "project-items"; a GET and a POST of one path get get-/save- prefixes */
function commandName(endpoint: Endpoint, all: Endpoint[]): string {
  const base = endpoint.path.replace(/^api\//, "").replace(/\//g, "-");
  const shared = all.filter((e) => e.path === endpoint.path).length > 1;
  return shared ? `${endpoint.method === "GET" ? "get" : "save"}-${base}` : base;
}

async function value(raw: string, type: string): Promise<unknown> {
  const text = raw.startsWith("@") ? await Deno.readTextFile(raw.slice(1)) : raw;
  if (type === "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let cli = new Command()
  .name("dwb")
  .description("World Builder (dimOS Desktop app) from the shell: one command per public endpoint")
  .globalOption("--url <url:string>", "the app, through Desktop", {
    default: Deno.env.get("DWB_URL") ?? "http://127.0.0.1:5555/apps/dim-world-builder",
  }) as unknown as Command;

for (const endpoint of contract.provides.endpoints) {
  const params = endpoint.params ?? {};
  let sub = new Command().description(
    `${endpoint.method} ${endpoint.path}: ${endpoint.description}`,
  );
  for (const [name, param] of Object.entries(params)) {
    sub = sub.option(
      `--${name} <${name}:string>`,
      `${param.description} (${param.type})`,
    ) as Command;
  }
  sub = sub.action(async (options: Record<string, string>) => {
    const values: Record<string, unknown> = {};
    for (const [name, param] of Object.entries(params)) {
      if (options[name] !== undefined) values[name] = await value(options[name], param.type);
    }
    let target = `${options.url.replace(/\/$/, "")}/${endpoint.path}`;
    const init: RequestInit = { method: endpoint.method };
    if (endpoint.method === "GET") {
      const query = new URLSearchParams(Object.entries(values).map(([k, v]) => [k, String(v)]));
      if ([...query].length) target += `?${query}`;
    } else {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(values);
    }
    const response = await fetch(target, init);
    const text = await response.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
    if (!response.ok) Deno.exit(1);
  }) as Command;
  cli = cli.command(commandName(endpoint, contract.provides.endpoints), sub) as Command;
}

await cli.parse(Deno.args);
