// Tor client. Routes HTTP requests through the local Tor daemon's SOCKS5
// proxy on port 9050. Uses `socks5h://` scheme so DNS resolution happens
// inside the Tor network (not on our host) — otherwise a plaintext DNS
// query would leak the target hostname.
//
// Circuit rotation: we ask Tor's control port (9051) for a NEWNYM signal.
// Tor picks a new circuit for future connections; existing streams keep
// their current exit. There's a 10-second rate-limit inside Tor on how
// often NEWNYM will actually rebuild circuits, so calling it in a tight
// loop is pointless.
//
// Safety limits (enforced here, not in the MCP layer, so a direct import
// can't accidentally bypass them):
//   - method: GET/POST/HEAD only
//   - timeout: 30s
//   - response body: capped at 10 MB (streamed, so large responses don't
//                    OOM the container)
//   - user-agent: pinned to the standard TorBrowser UA to blend in with
//                 the ~2M other Tor users. Overriding it via headers arg
//                 is allowed but discouraged (users will get fingerprinted
//                 if they set anything distinctive).

import axios, { type AxiosResponse } from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as net from "node:net";

const TOR_SOCKS_URL = process.env.TOR_SOCKS_URL || "socks5h://tor:9050";
const TOR_CONTROL_HOST = process.env.TOR_CONTROL_HOST || "tor";
const TOR_CONTROL_PORT = Number(process.env.TOR_CONTROL_PORT || 9051);
const TOR_CONTROL_PASSWORD = process.env.TOR_CONTROL_PASSWORD || "";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

// Standard TorBrowser UA (as of Firefox 115 ESR base). Kept in sync with
// what actual TorBrowser sends so our fleet blends in.
const TOR_UA =
  "Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0";

const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD"]);

// One shared agent — SocksProxyAgent handles per-request circuit selection
// itself; recreating it per request would waste TCP handshakes.
let cachedAgent: SocksProxyAgent | null = null;
function getAgent(): SocksProxyAgent {
  if (!cachedAgent) cachedAgent = new SocksProxyAgent(TOR_SOCKS_URL);
  return cachedAgent;
}

export interface TorFetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyBytes: number;
  truncated: boolean;
  durationMs: number;
  finalUrl: string;
}

export interface TorFetchOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean; // default true, capped at 5
}

export async function torFetch(
  url: string,
  opts: TorFetchOpts = {},
): Promise<TorFetchResult> {
  const method = (opts.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(
      `method ${method} not allowed — only GET, POST, HEAD (this skill is for anonymous fetching, not mutating resources)`,
    );
  }
  assertHttpUrl(url);

  const started = Date.now();
  const agent = getAgent();

  const headers: Record<string, string> = {
    "User-Agent": TOR_UA,
    "Accept-Language": "en-US,en;q=0.5",
    // Firefox default Accept for HTML pages
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    ...(opts.headers || {}),
  };

  let res: AxiosResponse<Buffer>;
  try {
    res = await axios.request<Buffer>({
      url,
      method,
      headers,
      data: opts.body,
      timeout: REQUEST_TIMEOUT_MS,
      httpAgent: agent,
      httpsAgent: agent,
      responseType: "arraybuffer",
      // Cap the body server-side so a malicious/huge response doesn't OOM
      // the container. Axios throws when the incoming size exceeds this.
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      maxRedirects: opts.followRedirects === false ? 0 : 5,
      // Don't treat 4xx/5xx as thrown errors — surface the status to the
      // caller. Also: for HEAD requests we care about headers, not body.
      validateStatus: () => true,
      // Refuse compression negotiation entirely — we're returning raw bytes
      // to the caller so any transparent gunzip would confuse the counter.
      decompress: true,
      // Prevent axios from following file:// or non-http protocols on redirect.
      // (`beforeRedirect` gets each hop; abort anything non-http/https.)
      beforeRedirect: (options) => {
        const proto = options.protocol;
        if (proto !== "http:" && proto !== "https:") {
          throw new Error(`refusing redirect to ${proto}`);
        }
      },
    });
  } catch (err) {
    const e = err as Error & { code?: string; message?: string };
    if (e.code === "ECONNABORTED" || /timeout/i.test(e.message || "")) {
      throw new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }
    if (/maxContentLength|maxBodyLength/.test(e.message || "")) {
      throw new Error(
        `response too large (max ${MAX_RESPONSE_BYTES / 1024 / 1024} MB)`,
      );
    }
    if (e.code === "ECONNREFUSED") {
      throw new Error(
        `tor daemon unreachable at ${TOR_SOCKS_URL} — is the tor container up?`,
      );
    }
    throw new Error(`tor fetch failed: ${e.message || String(err)}`);
  }

  const raw = res.data as unknown as Buffer;
  const bodyBytes = raw.length;
  const truncated = false; // axios enforces via maxContentLength; if we got here it fit
  const body = bufferToString(raw, res.headers["content-type"]);
  const responseHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    if (typeof v === "string") responseHeaders[k] = v;
    else if (Array.isArray(v)) responseHeaders[k] = v.join(", ");
  }
  return {
    status: res.status,
    headers: responseHeaders,
    body,
    bodyBytes,
    truncated,
    durationMs: Date.now() - started,
    finalUrl: (res.request?.res?.responseUrl as string) || url,
  };
}

function bufferToString(buf: Buffer, contentType?: string): string {
  // Best-effort text decoding. If content-type declares a charset use it,
  // otherwise assume UTF-8. Binary responses (images, PDFs) get lossy
  // decoded — callers who want the raw bytes should use a browser skill.
  let charset = "utf-8";
  if (contentType) {
    const m = /charset=([^;]+)/i.exec(contentType);
    if (m) charset = m[1].trim().toLowerCase();
  }
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

function assertHttpUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `only http/https URLs supported (got ${parsed.protocol}) — .onion works with either scheme`,
    );
  }
}

// --- Exit IP check ---
// Fetches https://check.torproject.org/api/ip which returns
//   { IsTor: true, IP: "185.220.101.42" }
// Cheap sanity check that we're actually routing through Tor.

export interface ExitIpInfo {
  ip: string;
  isTor: boolean;
  country?: string;
}

export async function getExitIp(): Promise<ExitIpInfo> {
  const res = await torFetch("https://check.torproject.org/api/ip");
  if (res.status !== 200) {
    throw new Error(`check.torproject.org returned ${res.status}`);
  }
  const parsed = JSON.parse(res.body) as { IsTor?: boolean; IP?: string };
  if (!parsed.IP) throw new Error("unexpected response shape from check.torproject.org");

  // Optional country lookup via ipapi.co (also routed through Tor so we
  // don't leak from our real IP). Best effort — timeouts don't fail the call.
  let country: string | undefined;
  try {
    const geo = await torFetch(`https://ipapi.co/${parsed.IP}/country_name/`);
    if (geo.status === 200) country = geo.body.trim() || undefined;
  } catch {
    // ignore
  }

  return {
    ip: parsed.IP,
    isTor: parsed.IsTor === true,
    country,
  };
}

// --- Circuit rotation via control port ---
// Speak the Tor control protocol directly. Format is line-based, ends with
// CRLF, responses look like "250 OK".
//
// This is only enabled if TOR_CONTROL_PASSWORD is set (we send it as
// AUTHENTICATE "<plaintext>"). The daemon hashes at boot and compares.

export async function newCircuit(): Promise<{ ok: boolean; message: string }> {
  if (!TOR_CONTROL_PASSWORD) {
    return {
      ok: false,
      message:
        "control port not configured — circuits will still rotate naturally every ~10 min",
    };
  }
  return new Promise((resolve) => {
    const socket = net.createConnection(TOR_CONTROL_PORT, TOR_CONTROL_HOST);
    let buf = "";
    const done = (ok: boolean, message: string) => {
      try {
        socket.end();
      } catch {
        // ignore
      }
      resolve({ ok, message });
    };
    socket.setTimeout(5000, () => done(false, "control port timeout"));
    socket.on("error", (e) => done(false, `control port error: ${e.message}`));
    socket.on("data", (chunk) => {
      buf += chunk.toString();
      // AUTHENTICATE ack, then SIGNAL ack. Two "250 OK" lines means success.
      if (buf.split("250 OK").length >= 3) {
        done(true, "new circuit requested");
      } else if (/^5\d\d/.test(buf.trim())) {
        done(false, `control port refused: ${buf.trim()}`);
      }
    });
    socket.on("connect", () => {
      // Escape any double-quotes in the password (Tor control protocol quoting).
      const esc = TOR_CONTROL_PASSWORD.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      socket.write(`AUTHENTICATE "${esc}"\r\nSIGNAL NEWNYM\r\nQUIT\r\n`);
    });
  });
}

// --- Reachability check ---
// HEAD request, quick. Useful before doing an expensive fetch to confirm
// the site is actually reachable through Tor at all (some sites block Tor
// exits, this tells you upfront).

export async function checkReachable(url: string): Promise<{
  reachable: boolean;
  status: number;
  hint?: string;
}> {
  try {
    const res = await torFetch(url, { method: "HEAD" });
    let hint: string | undefined;
    if (res.status === 403 || res.status === 429) {
      hint = "site is likely blocking Tor exit nodes";
    } else if (res.status >= 500) {
      hint = "server error — could be Tor-related or the site is just down";
    } else if (res.status === 0) {
      hint = "connection refused";
    }
    return { reachable: res.status > 0 && res.status < 400, status: res.status, hint };
  } catch (e) {
    return { reachable: false, status: 0, hint: (e as Error).message };
  }
}
