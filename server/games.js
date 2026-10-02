// Game catalog. Each source is an adapter that returns games in Silicon's shape; /api/games merges them.
// Games are never proxied: the player loads them directly from where they live (see public/silicon/play.html).
// To add a source (GN-Math, ...), write another adapter below and register it in SOURCES.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const UA = "Mozilla/5.0 (compatible; Silicon)";
const TTL = 60 * 60 * 1000;
// Games to leave out of the library: an array of ids in server/games-hidden.json (read on every request, no restart needed).
async function hiddenIds() {
  try { return new Set(JSON.parse(await readFile(join(here, "games-hidden.json"), "utf8"))); } catch { return new Set(); }
} // refetch a source at most once an hour

// Game shape: { id, title, source, tags: string[], category?, thumb?, url (embed) | path (hosted here), mode?, top?, warnings?: string[] }

// ---- Selenite (https://selenite.cc): list at /resources/games.json, games at /resources/semag/<dir>/index.html
const SELENITE = (process.env.SELENITE_URL || "https://selenite.cc").replace(/\/$/, ""); // override to use a mirror
const FLAG_TAGS = new Set(["top", "wip", "13+", "18+", "gore"]); // shown as badges/rows, not as categories
async function selenite() {
  const res = await fetch(`${SELENITE}/resources/games.json`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Selenite answered ${res.status}`);
  const list = await res.json();
  return list.map((g) => {
    const tags = (g.tags || []).map((t) => String(t).toLowerCase());
    const base = `${SELENITE}/resources/semag/${encodeURIComponent(g.directory)}`;
    return {
      id: `selenite:${g.directory}`,
      title: g.name,
      source: "selenite",
      tags: tags.filter((t) => !FLAG_TAGS.has(t)),
      category: tags.find((t) => !FLAG_TAGS.has(t)),
      thumb: g.image ? `/api/games/thumb/selenite/${encodeURIComponent(g.directory)}/${encodeURIComponent(g.image)}` : undefined, // via this server, see mountGames
      url: `${base}/index.html`,
      top: tags.includes("top") || undefined,
      warnings: ["13+", "18+", "gore", "wip"].filter((t) => tags.includes(t)),
    };
  });
}


// ---- GN-Math (https://gn-math.dev): the home page holds the (encoded) paths of its catalog, cover art and
// game pages ("[!] ..." entries in the catalog are notices, not games); the catalog lists games with {COVER_URL}/{HTML_URL} placeholders. Game pages are served as
// text/plain, so they are not plain "open this URL" games: see kind "html-text" below.
const GNMATH = (process.env.GNMATH_URL || "https://gn-math.dev").replace(/\/$/, "");
const gnBases = { cover: null, html: null };
async function gnmath() {
  const opts = { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) };
  const home = await fetch(`${GNMATH}/`, opts);
  if (!home.ok) throw new Error(`GN-Math answered ${home.status}`);
  const page = await home.text();
  const grab = (name) => page.match(new RegExp(`(?:let|const|var)\\s+${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
  const zones = grab("zonesURL"), cover = grab("coverURL"), html = grab("htmlURL");
  if (!zones || !cover || !html) throw new Error("couldn't find GN-Math's catalog paths (the site layout may have changed)");
  const strip = (u) => u.replace(/\/+$/, "");
  gnBases.cover = strip(cover); gnBases.html = strip(html);
  const res = await fetch(new URL(zones, GNMATH + "/"), opts);
  if (!res.ok) throw new Error(`GN-Math catalog answered ${res.status}`);
  const list = await res.json();
  const fill = (u, base) => String(u).replace("{COVER_URL}", gnBases.cover).replace("{HTML_URL}", base).replace(/([^:])\/\/+/g, "$1/");
  return list.filter((z) => z && z.id >= 0 && z.name && !/^\[!\]/.test(z.name)).map((z) => {
    const tags = (z.special || []).map((t) => String(t).toLowerCase());
    const external = /^https?:/i.test(z.url); // a few entries are plain links to another site
    return {
      id: `gnmath:${z.id}`,
      title: z.name,
      source: "gnmath",
      tags,
      category: tags[0],
      byline: z.author ? `by ${z.author}` : undefined,
      thumb: z.cover && !/^https?:/i.test(z.cover) ? `/api/games/thumb/gnmath/${encodeURIComponent(String(z.cover).replace(/^\{COVER_URL\}\/?/, ""))}` : undefined,
      url: external ? z.url : new URL(fill(z.url, gnBases.html), GNMATH + "/").href,
      kind: external ? undefined : "html-text",
      mode: external ? "external" : undefined,
      top: z.featured || undefined,
    };
  });
}

// ---- Wasm.RIP (https://wasm.rip): a GitHub Pages site. games.json lists ports (some "featured"); game pages
// live under /files/<name>/ and are ordinary HTML, so they can be framed directly.
const WASMRIP = (process.env.WASMRIP_URL || "https://wasm.rip").replace(/\/$/, "");
async function wasmrip() {
  const res = await fetch(`${WASMRIP}/games.json`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Wasm.RIP answered ${res.status}`);
  const list = await res.json();
  const used = new Set();
  return list.filter((g) => g && g.name && g.gameUrl).map((g) => {
    let slug = String(g.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(g.id); // their numeric ids repeat
    while (used.has(slug)) slug += "-" + g.id;
    used.add(slug);
    const image = g.imageUrl && !/^https?:/i.test(g.imageUrl) ? String(g.imageUrl).replace(/^\.?\/?img\//, "") : null;
    return {
      id: `wasmrip:${slug}`,
      title: g.name,
      source: "wasmrip",
      tags: ["port"],
      category: "port",
      byline: g.porter ? `port by ${g.porter}` : undefined,
      thumb: image ? `/api/games/thumb/wasmrip/${encodeURIComponent(image)}` : g.imageUrl,
      url: new URL(g.gameUrl, WASMRIP + "/").href, // a few entries are absolute links to other sites
    };
  });
}

// ---- Truffled (https://truffled.lol): /js/json/g.json lists games; each has a site-relative url (hosted there)
// or, for the "proxied" ones, a link to another site. Their wrapper pages just frame the game's url.
const TRUFFLED = (process.env.TRUFFLED_URL || "https://truffled.lol").replace(/\/$/, "");
async function truffled() {
  const res = await fetch(`${TRUFFLED}/js/json/g.json`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Truffled answered ${res.status}`);
  const list = (await res.json())?.games;
  if (!Array.isArray(list)) throw new Error("unexpected Truffled catalog format");
  const used = new Set();
  return list.filter((g) => g && g.name && g.url).map((g) => {
    const abs = /^https?:/i.test(g.url);
    const target = new URL(g.url, TRUFFLED + "/");
    let slug = ((abs ? target.hostname : "") + target.pathname).toLowerCase().replace(/\/index\.html?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    while (used.has(slug)) slug += "-x";
    used.add(slug);
    const tags = [];
    if (/unity/i.test(g.frameType || "")) tags.push("unity");
    if (g.category === "proxied" || g.frameType === "proxy") tags.push("web"); // links to other sites
    // "Cuphead, Webport": the suffix marks a web port. Show the clean name, tag it "port", keep the original searchable.
    const ported = /,\s*web ?port$/i.test(g.name);
    const title = ported ? g.name.replace(/,\s*web ?port$/i, "").trim() : g.name;
    if (ported) tags.push("port");
    const alts = [...new Set([...(Array.isArray(g.altNames) ? g.altNames.map(String) : []), ...(ported ? [g.name] : [])])].filter((a) => a.toLowerCase() !== title.toLowerCase());
    const thumb = g.thumbnail && !/^https?:/i.test(g.thumbnail) ? "/" + String(g.thumbnail).replace(/^\/+/, "") : null;
    return {
      id: `truffled:${slug}`,
      title,
      source: "truffled",
      tags,
      category: tags[0],
      alt: alts.length ? alts : undefined, // extra names, searchable
      thumb: thumb ? `/api/games/thumb/truffled?p=${encodeURIComponent(thumb)}` : g.thumbnail,
      url: target.href,
    };
  });
}

// ---- Seraph (https://ijnfem.github.io/seraph): a static GitHub Pages site with no JSON list. The games page is
// plain HTML where each game is <a href="<dir>/index.html"><div class="button" style="background-image:url(..)"
// data-genre="..."><h2>name</h2>, so the catalog is read out of that markup. Games are ordinary pages under /games/.
const SERAPH = (process.env.SERAPH_URL || "https://ijnfem.github.io/seraph").replace(/\/$/, "");
async function seraph() {
  const page = `${SERAPH}/games/index.html`;
  const res = await fetch(page, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Seraph answered ${res.status}`);
  const html = await res.text();
  const card = /<a[^>]*href="([^"#:]+\/index\.html)"[^>]*>\s*<div class="button"([^>]*)>\s*<h2>([^<]*)<\/h2>/g;
  const fixGenre = { aracde: "arcade", simulator: "simulation" }; // typos/near-duplicates on their side
  const decode = (t) => t.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const seen = new Set(), games = [];
  for (const m of html.matchAll(card)) {
    const [, href, attrs, rawName] = m;
    if (href.startsWith("..") || href.startsWith("/") || seen.has(href)) continue; // skip site navigation like ../index.html
    seen.add(href);
    const dir = href.replace(/\/index\.html$/, "");
    const img = attrs.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
    const genre = (attrs.match(/data-genre="([^"]*)"/)?.[1] || "").trim().toLowerCase();
    const tag = fixGenre[genre] || genre;
    const file = img ? decodeURIComponent(img.split("/").pop()) : null;
    games.push({
      id: `seraph:${dir.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      title: decode(rawName.trim()).replace(/(^|\s)([a-z])/g, (x, sp, c) => sp + c.toUpperCase()), // their names are all lowercase
      source: "seraph",
      tags: tag ? [tag] : [],
      category: tag || undefined,
      thumb: file ? `/api/games/thumb/seraph/${encodeURIComponent(file)}` : undefined,
      url: new URL(href, page).href,
    });
  }
  return games;
}

// ---- CKV (https://chickenkingswebsite.neocities.org): a static Neocities site. gamepage lists cards
// <a class="game-link" href="x.html"><img src=..><div>Name</div></a>. Each x.html is only a wrapper (toolbar with a
// "Home" button plus an iframe of the real game page), so the catalog resolves each wrapper to its inner game page
// and plays that directly. If a wrapper can't be read, the wrapper page itself is used.
const CKV = (process.env.CKV_URL || "https://chickenkingswebsite.neocities.org").replace(/\/$/, "");
async function ckv() {
  const opts = { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) };
  const res = await fetch(`${CKV}/gamepage`, opts);
  if (!res.ok) throw new Error(`CKV answered ${res.status}`);
  const html = await res.text();
  const decode = (t) => t.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const card = /<a class="game-link" href="([^"]+)">\s*<img src="([^"]+)"[^>]*>\s*<div>([^<]*)<\/div>/g;
  const cards = [], seen = new Set();
  for (const m of html.matchAll(card)) {
    const [, href, img, name] = m;
    if (seen.has(href) || /^[a-z]+:|^\//i.test(href)) continue;
    seen.add(href);
    cards.push({ href, img, name: decode(name.trim()) });
  }
  // Resolve each wrapper to its inner game page, a few at a time.
  const inner = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < cards.length) {
      const c = cards[next++], wrapper = new URL(c.href, CKV + "/").href;
      try {
        const r = await fetch(wrapper, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12000) });
        const m = r.ok && (await r.text()).match(/<iframe[^>]*\bsrc=(?:"([^"]*)"|'([^']*)')/i); // match the same quote (names can contain ')
        const src = m && (m[1] ?? m[2]);
        if (src) inner.set(c.href, new URL(src, wrapper).href);
      } catch {}
    }
  }));
  return cards.map((c) => ({
    id: `ckv:${c.href.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title: c.name,
    source: "ckv",
    tags: [],
    thumb: `/api/games/thumb/ckv/${encodeURIComponent(c.img.replace(/^\.?\//, ""))}`,
    url: inner.get(c.href) || new URL(c.href, CKV + "/").href,
  }));
}

// ---- Games hosted by this server, listed in public/games/games.json ({ games: [...] })
async function local() {
  try { return JSON.parse(await readFile(join(here, "../public/games/games.json"), "utf8")).games || []; } catch { return []; }
}

const SOURCES = {
  selenite: { label: "Selenite", load: selenite },
  gnmath: { label: "GN-Math", load: gnmath },
  truffled: { label: "Truffled", load: truffled },
  seraph: { label: "Seraph", load: seraph },
  ckv: { label: "CKV", load: ckv },
  wasmrip: { label: "Wasm.RIP", load: wasmrip },
  local: { label: "Silicon", load: local },
};

// ---- Automatic updates
// Nothing is stored on disk: every source is fetched live at startup and again every GAMES_REFRESH_MINUTES
// (default 30). The latest result is only held in this process's memory so requests don't hit the sources each time
// (and, if a refresh fails, the last good result stays available instead of the library going empty).
const REFRESH_MS = Math.max(0.05, Number(process.env.GAMES_REFRESH_MINUTES) || 30) * 60 * 1000;
const state = new Map(); // key -> { at, games, error }
const inflight = new Map(); // key -> Promise
let seen = {}; // id -> when this process first saw it (ms). 0 = there from the first fetch, i.e. not "new". Memory only.

function refresh(key) {
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const prev = state.get(key);
    try {
      const games = await SOURCES[key].load();
      if (!games.length) throw new Error("source returned no games");
      const baseline = !prev?.games.length; // first fetch of this source: nothing in it counts as new
      const now = Date.now();
      let added = 0;
      for (const g of games) if (!(g.id in seen)) { seen[g.id] = baseline ? 0 : now; if (!baseline) added++; }
      state.set(key, { at: now, games, error: null });
      const before = prev?.games.length;
      if (before !== undefined && before !== games.length) console.log(`[games] ${key}: ${before} -> ${games.length} games${added ? ` (+${added} new)` : ""}`);
      else if (before === undefined) console.log(`[games] ${key}: ${games.length} games`);
    } catch (err) {
      console.warn(`[games] ${key}: update failed (${err.message || err}); ${prev?.games.length ? "keeping the last copy" : "no copy yet"}`);
      state.set(key, { at: prev?.at ?? 0, games: prev?.games ?? [], error: String(err.message || err) });
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, job);
  return job;
}

// Games for one source: from memory once fetched. Right after startup there is nothing yet, so wait for that first
// fetch, but not forever: past 7s the source is reported as still "loading" and the page asks again shortly.
async function gamesFor(key) {
  if (key === "local") return { games: await SOURCES.local.load(), error: null };
  if (!state.get(key)?.games.length) await Promise.race([refresh(key), new Promise((r) => setTimeout(r, 7000))]);
  const st = state.get(key);
  return { ...(st || { games: [], error: null }), loading: !st?.games.length && inflight.has(key) };
}

let started = false;
async function start() {
  if (started) return;
  started = true;
  for (const key of Object.keys(SOURCES)) if (key !== "local") refresh(key); // live fetch of every source at startup
  setInterval(() => Object.keys(SOURCES).filter((k) => k !== "local").forEach(refresh), REFRESH_MS).unref();
}

// Adds (or replaces) <base href> so the page's relative URLs resolve against the game's own folder or declared base.
function withBase(html, url) {
  const folder = url.slice(0, url.lastIndexOf("/") + 1);
  const declared = html.match(/<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))[^>]*>/i);
  let base = folder;
  const d = declared && (declared[1] ?? declared[2] ?? declared[3]);
  if (d) { try { base = new URL(d, folder).href; } catch {} }
  const tag = `<base href="${base}">`;
  if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + tag);
  return tag + html;
}

export function mountGames(app) {
  start();
  // Cover art is fetched by this server, so the browser never has to reach the source for it.
  const sendImage = async (res, url) => {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !type.startsWith("image/")) return res.status(404).end();
      res.set({ "Content-Type": type, "Cache-Control": "public, max-age=604800" }).send(Buffer.from(await r.arrayBuffer()));
    } catch { res.status(502).end(); }
  };
  app.get("/api/games/thumb/selenite/:dir/:file", (req, res) =>
    sendImage(res, `${SELENITE}/resources/semag/${encodeURIComponent(req.params.dir)}/${encodeURIComponent(req.params.file)}`));
  // Truffled thumbnails live at assorted paths, so the path comes as ?p= (checked: plain characters only, no "..").
  app.get("/api/games/thumb/truffled", (req, res) => {
    const p = String(req.query.p || "");
    if (!/^\/[A-Za-z0-9_.\/-]+$/.test(p) || p.includes("..") || p.includes("//")) return res.status(400).end();
    sendImage(res, `${TRUFFLED}${p}`);
  });
  app.get("/api/games/thumb/seraph/:file", (req, res) => sendImage(res, `${SERAPH}/images/thumbnails/${encodeURIComponent(req.params.file)}`));
  app.get("/api/games/thumb/ckv/:file", (req, res) => sendImage(res, `${CKV}/${encodeURIComponent(req.params.file)}`));
  app.get("/api/games/thumb/wasmrip/:file", (req, res) => sendImage(res, `${WASMRIP}/img/${encodeURIComponent(req.params.file)}`));
  app.get("/api/games/thumb/gnmath/:file", (req, res) =>
    gnBases.cover ? sendImage(res, `${GNMATH}${gnBases.cover}/${encodeURIComponent(req.params.file)}`) : res.status(404).end());

  // GN-Math pages are text/plain upstream. For direct (non-proxied) play, fetch the page here and serve it as
  // text/html with a <base> tag so its relative files still load from gn-math.dev (same trick the site uses).
  app.get("/api/games/play/:id", async (req, res) => {
    const key = req.params.id.split(":")[0];
    const game = SOURCES[key] && (await gamesFor(key)).games.find((g) => g.id === req.params.id);
    if (!game || game.kind !== "html-text") return res.status(404).type("text").send("Not found");
    try {
      const r = await fetch(game.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(String(r.status));
      res.set({ "Cache-Control": "public, max-age=300" }).type("html").send(withBase(await r.text(), game.url));
    } catch { res.status(502).type("text").send("Couldn't load this game from its server."); }
  });
  app.get("/api/games", async (req, res) => {
    const keys = Object.keys(SOURCES);
    const [results, hidden] = await Promise.all([Promise.all(keys.map(gamesFor)), hiddenIds()]);
    const sources = {}, games = [];
    keys.forEach((k, i) => {
      const shown = results[i].games.filter((g) => !hidden.has(g.id)).map((g) => (seen[g.id] > 0 ? { ...g, added: seen[g.id] } : g));
      sources[k] = { label: SOURCES[k].label, count: shown.length, error: results[i].error, updated: results[i].at || undefined, loading: results[i].loading || undefined };
      games.push(...shown);
    });
    res.set("Cache-Control", "public, max-age=60").json({ sources, games });
  });
  app.get("/api/games/:id", async (req, res) => {
    const key = req.params.id.split(":")[0];
    const list = (await gamesFor(SOURCES[key] ? key : "local")).games;
    const game = (await hiddenIds()).has(req.params.id) ? null : list.find((g) => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.set("Cache-Control", "public, max-age=60").json({ game, source: { key, label: SOURCES[key]?.label || key } });
  });
}
