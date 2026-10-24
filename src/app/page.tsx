import Link from "next/link";
import { auth, enabledProviders } from "@/lib/auth";
import { SignInButtons } from "./signin-button";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "tor": {
      "url": "https://tor.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KEY>"
      }
    }
  }
}`;

export default async function LandingPage() {
  const session = await auth().catch(() => null);
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-14">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
          Hosted Tor · MCP · streamable-http
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          tor-mcp
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-400">
          Route HTTP requests through the Tor network from any MCP-compatible agent.
          Rotating anonymous exit IPs, .onion support, no request-body logging.
        </p>
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          <strong>Honest scope:</strong> Tor exit nodes are blocked by Cloudflare
          on most big-brand sites (Indeed, Google, Amazon). Use tor-mcp for
          non-CF sites, .onion services, and IP-based rate-limit circumvention.
          Use{" "}
          <Link
            href="https://browser.regiq.in"
            target="_blank"
            className="underline hover:text-amber-100"
          >
            browser-mcp
          </Link>{" "}
          when you actually need to hit Cloudflare-protected sites.
        </div>
        <div className="mt-8">
          {signedIn ? (
            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-400"
              >
                Open dashboard →
              </Link>
              <Link
                href="https://github.com/globalion/tor-mcp"
                target="_blank"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                GitHub ↗
              </Link>
            </div>
          ) : (
            <div className="max-w-sm">
              <SignInButtons providers={enabledProviders} />
              <Link
                href="https://github.com/globalion/tor-mcp"
                target="_blank"
                className="mt-2 block text-center text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                View on GitHub ↗
              </Link>
            </div>
          )}
        </div>
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          How it fits
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-300">
{`Your agent  →  tor-mcp  →  Tor daemon  →  Tor network  →  Target site
   (Claude,     (JSON-RPC MCP)  (SOCKS5)     (~2M other       (sees a
    Cursor,                                    Tor users)      random exit
    scripts)                                                   node IP)`}
        </pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Limits (per API key)
        </h2>
        <div className="grid grid-cols-1 gap-2 text-sm text-neutral-400 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Requests/day</div>
            <div className="mt-1 text-neutral-200">100 max</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Timeout</div>
            <div className="mt-1 text-neutral-200">30s per request</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Body cap</div>
            <div className="mt-1 text-neutral-200">10 MB response</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Cost</div>
            <div className="mt-1 text-neutral-200">Free forever</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Methods: GET / POST / HEAD only. No PUT / DELETE / PATCH (this skill
          is for anonymous fetching, not mutating resources). Higher quotas
          for aggregators — email shreyas.pavuluri@gmail.com.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Setup
        </h2>
        <ol className="space-y-2 text-neutral-300">
          <li>1. Sign in with Google.</li>
          <li>2. Generate an MCP API key on your dashboard.</li>
          <li>3. Add this to Claude Desktop / Cursor / your agent:</li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
          {CONFIG_SNIPPET}
        </pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Tools
        </h2>
        <ul className="space-y-1 text-sm text-neutral-400">
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-purple-300">tor_fetch(url, method?, headers?, body?)</code> — HTTP request through Tor; returns status/headers/body</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-purple-300">tor_get_exit_ip()</code> — current exit node IP + country (via check.torproject.org)</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-purple-300">tor_new_circuit()</code> — force fresh Tor circuit; rate-limited by Tor to once per ~10s</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-purple-300">tor_check(url)</code> — HEAD probe; is target reachable through Tor?</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Privacy
        </h2>
        <ul className="space-y-1 text-sm text-neutral-400">
          <li>• DNS resolves inside Tor (<code className="text-purple-300">socks5h://</code> scheme) — no plaintext lookup from our host</li>
          <li>• We log: target host, method, response status, duration, size. That&apos;s it.</li>
          <li>• We never log: full URLs, query strings, request bodies, response bodies, cookies, headers</li>
          <li>• Standard TorBrowser User-Agent sent by default — blend in with the fleet, not fingerprint yourself</li>
        </ul>
      </section>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        Built by{" "}
        <Link href="https://github.com/Shreyas-Profile" target="_blank" className="underline">
          Shreyas
        </Link>{" "}
        · Shipped by{" "}
        <Link href="https://github.com/globalion" target="_blank" className="underline">
          Globalion
        </Link>{" "}
        · MIT
      </footer>
    </main>
  );
}
