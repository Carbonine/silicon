// Site icons for the shortcut tiles on the new tab page. For an address, this server reads the site's own home page, finds the
// icon the page names (falling back to /favicon.ico) and passes that image on. Nothing goes through a favicon service, and
// nothing is saved to disk (icons are kept in memory for a few hours).
//
// Because the server is asked to fetch addresses, it only talks to public hosts: addresses that resolve to this machine or a
// private network are refused (checked again at connect time, so a DNS trick can't get around it), and replies are size limited.
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const UA = "Mozilla/5.0 (compatible; Silicon)";
const TTL = 6 * 60 * 60 * 1000, MAX_CACHE = 300;
const cache = new Map(); // origin -> { at, type, body } or { at, none: true }

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0));
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivate(mapped[1]);
    return l === "::1" || l === "::" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
  }
  return true;
}
// Used for every connection, so the address that is checked is the one that is connected to.
function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return cb(new Error("blocked address"));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
function safeGet(urlStr, { maxBytes, redirects = 3, accept = "*/*" }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error("bad address")); }
    if (!/^https?:$/.test(u.protocol)) return reject(new Error("bad address"));
    const bare = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(bare) && isPrivate(bare)) return reject(new Error("blocked address"));
    const req = (u.protocol === "https:" ? https : http).request(u, { method: "GET", headers: { "user-agent": UA, accept }, lookup: safeLookup, timeout: 8000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error("too many redirects"));
        return resolve(safeGet(new URL(res.headers.location, u).href, { maxBytes, redirects: redirects - 1, accept }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`status ${res.statusCode}`)); }
      const chunks = []; let n = 0;
      res.on("data", (c) => { n += c.length; if (n > maxBytes) req.destroy(new Error("too large")); else chunks.push(c); });
      res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks), url: u.href }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((x) => x !== undefined);
const decode = (t) => String(t).replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"');
function iconCandidates(html, base) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).map((tag) => ({ rel: (attr(tag, "rel") || "").toLowerCase(), href: attr(tag, "href"), sizes: attr(tag, "sizes") || "" }))
    .filter((l) => l.href && /(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/.test(l.rel));
  const rank = (l) => (/apple-touch/.test(l.rel) ? 100 : 0) + (/\b(32|48|64)x\d+/.test(l.sizes) ? 0 : /any/.test(l.sizes) ? 1 : 5);
  const urls = links.sort((a, b) => rank(a) - rank(b)).map((l) => { try { return new URL(decode(l.href), base).href; } catch { return null; } }).filter(Boolean);
  urls.push(new URL("/favicon.ico", base).href);
  return [...new Set(urls)].slice(0, 4);
}
// What kind of image these bytes are, or null if it isn't one we pass on.
function imageType(buf, declared = "") {
  const h = buf.subarray(0, 12);
  if (h[0] === 0 && h[1] === 0 && h[2] === 1 && h[3] === 0) return "image/x-icon";
  if (h[0] === 0x89 && h.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (h.toString("latin1", 0, 3) === "GIF") return "image/gif";
  if (h[0] === 0xff && h[1] === 0xd8) return "image/jpeg";
  if (h.toString("latin1", 0, 4) === "RIFF" && h.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (/^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 200).toString("utf8")) && /<svg/i.test(buf.subarray(0, 1000).toString("utf8"))) return "image/svg+xml";
  return null;
}

async function findIcon(origin) {
  let html = "";
  try { html = (await safeGet(origin + "/", { maxBytes: 300_000, accept: "text/html" })).body.toString("utf8"); } catch {}
  for (const url of iconCandidates(html, origin + "/")) {
    try {
      const r = await safeGet(url, { maxBytes: 400_000, accept: "image/*,*/*;q=0.5" });
      const type = imageType(r.body);
      if (type) return { type, body: r.body };
    } catch {}
  }
  return null;
}

export function mountIcons(app) {
  // GET /api/site-icon?u=https://example.com/anything  ->  that site's own icon, or 404
  app.get("/api/site-icon", async (req, res) => {
    let origin;
    try { const u = new URL(String(req.query.u || "")); if (!/^https?:$/.test(u.protocol)) throw 0; origin = u.origin; } catch { return res.status(400).end(); }
    let hit = cache.get(origin);
    if (!hit || Date.now() - hit.at > TTL) {
      const found = await findIcon(origin).catch(() => null);
      hit = found ? { at: Date.now(), ...found } : { at: Date.now(), none: true };
      cache.set(origin, hit);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    }
    if (hit.none) return res.status(404).set("Cache-Control", "public, max-age=3600").end();
    // The headers keep an SVG from running anything if its address is opened directly.
    res.set({ "Content-Type": hit.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }).send(hit.body);
  });
}
