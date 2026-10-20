// dwb: World Builder from the shell, one subcommand per public endpoint in dimos.yaml (the app's OpenAPI
// contract), so it stays in step with the server. Talks to the app through Desktop.
//   deno run -A tools/dwb.ts --help
//   deno run -A tools/dwb.ts generate --kind playground --name my_playground --seed 3
//   deno run -A tools/dwb.ts project-items --name my_playground --items '[{"kind":"primitive","params":{"shape":"box","color":[1,0,0]},"position":[2,0,0]}]'
//   deno run -A tools/dwb.ts export --name my_playground --parentDir ~/dimos_worlds
//   deno run -A tools/dwb.ts views-image --name my_playground --view overview --out overview.png
// A value starting with @ is read from that file; JSON values (objects, arrays, numbers) are parsed.
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { parse } from "jsr:@std/yaml@1";

interface Param {
  type: string;
  description: string;
}
interface Endpoint {
  method: string;
  path: string;
  description: string;
  params: Record<string, Param>;
}
interface Operation {
  summary?: string;
  description?: string;
  parameters?: { name: string; schema?: { type?: string }; description?: string }[];
  requestBody?: {
    content?: { "application/json"?: { schema?: { properties?: Record<string, Param> } } };
  };
}

const METHODS = ["get", "post", "put", "patch", "delete"];
const here = new URL("..", import.meta.url);
const yamlText =
  await (here.protocol === "file:"
    ? Deno.readTextFile(new URL("dimos.yaml", here))
    : (await fetch(new URL("dimos.yaml", here))).text());
const contract = parse(yamlText) as {
  provides: { paths: Record<string, Record<string, Operation>> };
};
// one endpoint per path and method; its params are the path/query parameters plus the JSON body's
const endpoints: Endpoint[] = Object.entries(contract.provides.paths).flatMap(([path, item]) =>
  Object.entries(item).filter(([method]) => METHODS.includes(method)).map(([method, operation]) => {
    const params: Record<string, Param> = {};
    for (const parameter of operation.parameters ?? []) {
      params[parameter.name] = {
        type: parameter.schema?.type ?? "string",
        description: parameter.description ?? "",
      };
    }
    Object.assign(
      params,
      operation.requestBody?.content?.["application/json"]?.schema?.properties ?? {},
    );
    return {
      method: method.toUpperCase(),
      path: path.replace(/^\//, ""),
      description: operation.summary ?? operation.description ?? "",
      params,
    };
  })
);

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

// the subcommands are built from dimos.yaml at run time, so cliffy's option typing can't follow them
// deno-lint-ignore no-explicit-any
type AnyCommand = Command<any, any, any, any, any, any, any, any>;

let cli: AnyCommand = new Command()
  .name("dwb")
  .description("World Builder (dimOS Desktop app) from the shell: one command per public endpoint")
  .globalOption("--url <url:string>", "the app, through Desktop", {
    default: Deno.env.get("DWB_URL") ?? "http://127.0.0.1:5555/apps/dim-world-builder",
  })
  .globalOption("--out <file:string>", "where an image answer is saved (default <view>.png)");

for (const endpoint of endpoints) {
  const params = endpoint.params;
  let sub: AnyCommand = new Command().description(
    `${endpoint.method} ${endpoint.path}: ${endpoint.description}`,
  );
  for (const [name, param] of Object.entries(params)) {
    sub = sub.option(`--${name} <${name}:string>`, `${param.description} (${param.type})`);
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
    if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
      // an image (api/views/image): saved to --out, or <view>.png here
      const file = options.out ?? `${values.view ?? "image"}.png`;
      await Deno.writeFile(file, new Uint8Array(await response.arrayBuffer()));
      console.log(file);
      return;
    }
    const text = await response.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
    if (!response.ok) Deno.exit(1);
  });
  cli = cli.command(commandName(endpoint, endpoints), sub);
}

await cli.parse(Deno.args);
