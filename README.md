# tor-mcp

Route HTTP requests through the Tor network from any MCP-compatible agent.

**Live at [tor.regiq.in](https://tor.regiq.in)** · Free forever · Google sign-in

## What it does

Gives Claude Desktop / Cursor / any MCP client four tools:

| Tool | What it does |
|---|---|
| `tor_fetch(url, method?, headers?, body?)` | HTTP request through Tor; returns status/headers/body |
| `tor_get_exit_ip()` | Current exit node IP + country (verified via check.torproject.org) |
| `tor_new_circuit()` | Force a fresh Tor circuit (SIGNAL NEWNYM) |
| `tor_check(url)` | HEAD probe — is target reachable through Tor? |

## Honest scope

Tor exit nodes are **blocked** by Cloudflare on most big-brand sites (Indeed, Google, Amazon, etc.). Use tor-mcp for:

- Non-Cloudflare sites
- Geo-hidden fetches (see a site from a random country)
- `.onion` services
- IP-based rate-limit circumvention on APIs that don't blocklist Tor
- Testing your own site from N different exits

If you need to hit Cloudflare-protected sites, use [browser-mcp](https://browser.regiq.in) instead — real Chrome from a fixed Hetzner IP works for most WAFs, and you can layer a residential proxy on top for the rest.

## Setup

1. Sign in with Google at [tor.regiq.in](https://tor.regiq.in)
2. Generate an MCP API key on your dashboard
3. Add to Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "tor": {
      "url": "https://tor.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KEY>"
      }
    }
  }
}
```

## Limits (per API key, free tier)

- 100 requests/day
- 30s timeout per request
- 10 MB response body cap
- Methods: GET, POST, HEAD only

Higher quotas for aggregators — email shreyas.pavuluri@gmail.com.

## Privacy

- DNS resolves inside Tor (`socks5h://` scheme) — no plaintext lookup from our host
- We log: target host, method, response status, duration, size
- We **never** log: full URLs, query strings, request bodies, response bodies, cookies, headers
- Standard TorBrowser User-Agent sent by default

## Self-host

```bash
git clone https://github.com/globalion/tor-mcp
cd tor-mcp
cp .env.example .env  # fill in
docker compose up -d --build
```

Then browse to `http://localhost:3021`.

## License

MIT · Built by [Shreyas](https://github.com/Shreyas-Profile) · Shipped by [Globalion](https://github.com/globalion)
