import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { getCurrentKeyPrefix } from "@/lib/keys";
import { prisma } from "@/lib/db";
import { KeyPanel } from "./key-panel";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const sp = await searchParams;
  const rawKey = typeof sp.freshKey === "string" ? sp.freshKey : null;

  const [prefix, recentRequests] = await Promise.all([
    getCurrentKeyPrefix(session.user.id),
    prisma.requestLog.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { host: true, method: true, status: true, durationMs: true, createdAt: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your tor-mcp dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">Signed in as {session.user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          MCP API key
        </h2>
        <KeyPanel initialPrefix={prefix} freshKey={rawKey} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Recent requests (last 10)
        </h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          {recentRequests.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No requests yet. Fire one from your agent to see it appear here.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pb-2">Host</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Duration</th>
                  <th className="pb-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r, i) => (
                  <tr key={i} className="border-t border-neutral-800">
                    <td className="py-2 font-mono text-neutral-300">{r.host}</td>
                    <td className="py-2 text-neutral-400">{r.method}</td>
                    <td
                      className={
                        "py-2 " +
                        (r.status >= 200 && r.status < 300
                          ? "text-emerald-400"
                          : r.status >= 400
                            ? "text-amber-400"
                            : "text-neutral-400")
                      }
                    >
                      {r.status}
                    </td>
                    <td className="py-2 text-neutral-400">{r.durationMs}ms</td>
                    <td className="py-2 text-right text-neutral-500">
                      {formatRelative(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-neutral-600">
            Only metadata is stored. URLs, request bodies, and response bodies
            are never logged.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Claude Desktop config
        </div>
        <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs text-neutral-200">
{`{
  "mcpServers": {
    "tor": {
      "url": "https://tor.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <PASTE_YOUR_KEY>"
      }
    }
  }
}`}
        </pre>
        <p className="mt-3 text-xs text-neutral-500">
          <Link href="/" className="underline">← Back to overview</Link>
        </p>
      </section>
    </main>
  );
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
