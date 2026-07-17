// MCP tools for tor-mcp. All requests go through a shared Tor daemon
// (SOCKS5 on port 9050 in the tor container). No sessions — every call
// is independent; Tor's own circuit management handles anonymity.

import { z } from "zod";

export const TOOL_DEFINITIONS = [
  {
    name: "tor_fetch",
    description:
      "Fetch a URL through the Tor network. Returns { status, headers, body, exitIp, durationMs }. GET/POST/HEAD only. 30s timeout, 10MB body cap. Body is decoded as text (best-effort); binary responses come back as lossy UTF-8. Note: Cloudflare-protected sites (Indeed, Google, most big-brand sites) actively block Tor exits — use browser-mcp for those. Tor works for: non-CF sites, geo-hidden fetches, .onion services, IP-based rate-limit circumvention on APIs that don't blocklist Tor.",
    inputSchema: z.object({
      url: z.string().url(),
      method: z.enum(["GET", "POST", "HEAD"]).default("GET"),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string().max(1_000_000).optional().describe("Request body for POST. Max 1MB."),
      followRedirects: z.boolean().default(true).describe("Follow up to 5 redirects."),
    }),
  },
  {
    name: "tor_get_exit_ip",
    description:
      "Return the current Tor exit node's IP + country. Uses check.torproject.org for the IsTor confirmation, ipapi.co for country. Useful to verify traffic is actually routed through Tor and to know which country the request will appear from.",
    inputSchema: z.object({}),
  },
  {
    name: "tor_new_circuit",
    description:
      "Ask the Tor daemon for a fresh circuit (SIGNAL NEWNYM). Future connections will use a new exit node. Rate-limited by Tor itself to once per ~10 seconds. Existing streams keep their current exit. Only works if the container's control port is configured — otherwise returns a hint that circuits still rotate naturally every ~10 min.",
    inputSchema: z.object({}),
  },
  {
    name: "tor_check",
    description:
      "Quick HEAD request through Tor to see if a target is reachable. Returns { reachable, status, hint }. Faster than a full tor_fetch — use this to filter target lists before doing expensive fetches. Common hints: 'site is likely blocking Tor exit nodes' for 403/429.",
    inputSchema: z.object({
      url: z.string().url(),
    }),
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export function findTool(name: string) {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function jsonSchemaFor(name: ToolName) {
  const t = findTool(name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return zodToJsonSchema(t.inputSchema);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as unknown as { _def: any })._def;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodRecord":
      return { type: "object", additionalProperties: zodToJsonSchema(def.valueType) };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    case "ZodDefault": {
      const inner = zodToJsonSchema(def.innerType);
      inner.default = def.defaultValue();
      return inner;
    }
    case "ZodObject": {
      const shape = def.shape();
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape) as [string, z.ZodTypeAny][]) {
        props[k] = zodToJsonSchema(v);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vDef = (v as unknown as { _def: any })._def;
        if (vDef.typeName !== "ZodOptional" && vDef.typeName !== "ZodDefault") {
          required.push(k);
        }
      }
      return { type: "object", properties: props, required };
    }
    default:
      return {};
  }
}
