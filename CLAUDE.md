# Deploying tor-mcp to Hetzner + regiq.in

## Server (shared with the rest of the Globalion MCP fleet)
- SSH: `root@89.167.56.16`
- Service directory: `/opt/tor-mcp/`
- Domain: `tor.regiq.in` (Cloudflare-tunnelled to `tor-mcp-web:3000`)
- Container names: `tor-mcp-tor`, `tor-mcp-web`, `tor-mcp-db`
- **NEVER touch** other people's folders under `/opt/` — see `shreyas-onboarding.md` §7.

## Deploy

```bash
tar --exclude=node_modules --exclude=.next --exclude=.git -cf - . \
  | ssh root@89.167.56.16 "mkdir -p /opt/tor-mcp && tar -xf - -C /opt/tor-mcp/"
ssh root@89.167.56.16 "cd /opt/tor-mcp && docker compose up -d --build"
```

## First-time subdomain wiring

1. Add to `/opt/platform/cloudflared/config.yml` on the server, BEFORE the catch-all:
   ```yaml
   - hostname: tor.regiq.in
     service: http://tor-mcp-web:3000
   ```
2. Restart tunnel: `ssh root@89.167.56.16 "docker restart platform-cloudflared-1"`
3. Create DNS: `ssh root@89.167.56.16 "docker exec platform-cloudflared-1 cloudflared tunnel route dns 0caf1caf-59f6-4f36-9ea5-4aa9a9f41d0b tor.regiq.in"`

## Env vars

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — new OAuth client per subdomain
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `NEXTAUTH_URL=https://tor.regiq.in`, `PUBLIC_BASE_URL=https://tor.regiq.in`
- `TOR_CONTROL_PASSWORD` — `openssl rand -hex 24`. Web container uses it to send SIGNAL NEWNYM. Never exposed externally.
- `ADMIN_EMAILS=shreyas.pavuluri@gmail.com`

## Health

```bash
curl https://tor.regiq.in/api/admin/health
# expected: { ok: true, db: "ok", tor: { ok: true, ip: "185.220.101.42", country: "Netherlands" } }
```

## Rules

- **Never log request/response bodies.** Only host + method + status + duration + size. Users route through Tor for privacy — logging kills the value.
- **DNS through Tor.** Always `socks5h://` (not `socks5://`). The `h` sends hostname to Tor for resolution.
- **Control port never exposed to the internet.** Only the internal docker network.
- Tor daemon takes 10-30s to bootstrap after container start — expect first requests to fail with `tor daemon unreachable`.
- Expose `/api/admin/health` — the check hits check.torproject.org through Tor to verify actual routing.
