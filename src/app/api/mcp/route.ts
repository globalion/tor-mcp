// MCP-over-HTTP endpoint for tor-mcp. JSON-RPC 2.0. Auth: Bearer <apiKey>.

import { NextResponse } from "next/server";
import { findLiveKey } from "@/lib/keys";
import { torFetch, getExitIp, newCircuit, checkReachable } from "@/lib/tor";
import { checkRate } from "@/lib/rate-limit";
import { isAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  TOOL_DEFINITIONS,
  findTool,
  jsonSchemaFor,
  type ToolName,
} from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "tor-mcp", version: "0.1.0" };

// Free-tier caps
const REQUESTS_PER_DAY = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const rpc = await req.json().catch(() => null);
  if (!isValidRpc(rpc)) return jsonRpcError(null, -32700, "Parse error");

  if (rpc.method === "initialize") {
    return jsonRpcOk(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  const auth = req.headers.get("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = raw ? await findLiveKey(raw) : null;
  if (!key) {
    return jsonRpcError(rpc.id, -32001, "Unauthorized — set Authorization: Bearer <key>");
  }
  const userId = key.userId;

  switch (rpc.method) {
    case "tools/list":
      return jsonRpcOk(rpc.id, {
        tools: TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: jsonSchemaFor(t.name),
        })),
      });

    case "tools/call": {
      const { name, arguments: args } = (rpc.params ?? {}) as {
        name?: string;
        arguments?: unknown;
      };
      if (!name) return jsonRpcError(rpc.id, -32602, "Missing tool name");
      const tool = findTool(name);
      if (!tool) return jsonRpcError(rpc.id, -32601, `Unknown tool: ${name}`);

      const parsed = tool.inputSchema.safeParse(args ?? {});
      if (!parsed.success) {
        return jsonRpcError(
          rpc.id,
          -32602,
          "Invalid arguments: " + JSON.stringify(parsed.error.flatten()),
        );
      }

      // Rate limit — skipped for admins. Only enforced on tools that hit
      // the network (tor_fetch, tor_check, tor_get_exit_ip). tor_new_circuit
      // is cheap and doesn't leave the tor container.
      const chargeable = name !== "tor_new_circuit";
      if (chargeable) {
        const admin = await isAdminUser(userId);
        if (!admin) {
          const rl = checkRate("day", key.keyPrefix, REQUESTS_PER_DAY, DAY_MS);
          if (!rl.allowed) {
            return jsonRpcOk(rpc.id, {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Rate limit hit: ${REQUESTS_PER_DAY} requests/day per API key. Retry in ${rl.retryAfterSec}s.`,
                },
              ],
            });
          }
        }
      }

      try {
        const result = await runTool(name as ToolName, parsed.data, userId);
        return jsonRpcOk(rpc.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (err) {
        return jsonRpcOk(rpc.id, {
          isError: true,
          content: [{ type: "text", text: (err as Error).message || String(err) }],
        });
      }
    }

    case "ping":
      return jsonRpcOk(rpc.id, {});

    default:
      return jsonRpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: ToolName, args: any, userId: string) {
  switch (name) {
    case "tor_fetch": {
      const res = await torFetch(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.body,
        followRedirects: args.followRedirects,
      });
      await logRequest(userId, args.url, args.method || "GET", res.status, res.durationMs, res.bodyBytes);
      return res;
    }
    case "tor_get_exit_ip": {
      const info = await getExitIp();
      return info;
    }
    case "tor_new_circuit": {
      return await newCircuit();
    }
    case "tor_check": {
      const res = await checkReachable(args.url);
      return res;
    }
  }
}

async function logRequest(
  userId: string,
  url: string,
  method: string,
  status: number,
  durationMs: number,
  bytesOut: number,
) {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "invalid";
  }
  await prisma.requestLog
    .create({
      data: { userId, host, method, status, durationMs, bytesOut },
    })
    .catch(() => undefined);
}

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

function isValidRpc(x: unknown): x is RpcRequest {
  if (!x || typeof x !== "object") return false;
  const r = x as RpcRequest;
  return r.jsonrpc === "2.0" && typeof r.method === "string";
}

function jsonRpcOk(id: RpcRequest["id"] | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(
  id: RpcRequest["id"] | undefined | null,
  code: number,
  message: string,
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: code === -32001 ? 401 : 200 },
  );
}
