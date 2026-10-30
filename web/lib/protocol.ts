import type { Settings } from "./types";

export const INTERNAL_GLYPHS: Record<string, string | null> = { newtab: null, games: "sports_esports", play: "sports_esports", settings: "settings", bookmarks: "bookmark", history: "history", error: "cloud_off" };

export const ENGINES: Record<string, { label: string; url?: string }> = {
  duckduckgo: { label: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=%s" },
  google: { label: "Google", url: "https://www.google.com/search?q=%s" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q=%s" },
  brave: { label: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  startpage: { label: "Startpage", url: "https://www.startpage.com/do/search?q=%s" },
  ecosia: { label: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
  wikipedia: { label: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s" },
  yandex: { label: "Yandex", url: "https://yandex.com/search/?text=%s" },
  custom: { label: "Custom…" },
};

/** silicon://games → /silicon/games. silicon://play?game=x and silicon://play/x → /silicon/play/x. Null if unknown. */
export function internalToRoute(url: string): string | null {
  const m = url.match(/^silicon:\/\/([^/?#]+)(?:\/([^?#]+))?\/?([?#].*)?$/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!(name in INTERNAL_GLYPHS)) return null;
  if (name === "play") {
    const id = m[2] ?? new URLSearchParams(m[3] ?? "").get("game");
    return id ? `/silicon/play/${encodeURIComponent(decodeURIComponent(id))}` : null;
  }
  return m[2] ? null : `/silicon/${name}${m[3] ?? ""}`;
}

/** The reverse, for showing a loaded page in the address bar. Null if the path isn't a silicon:// page. */
export function routeToInternal(pathname: string, search = ""): string | null {
  const m = pathname.match(/^\/silicon\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!m || !(m[1] in INTERNAL_GLYPHS)) return null;
  return `silicon://${m[1]}${m[2] ? `/${m[2]}` : ""}${search}`;
}

/** An absolute URL if the input looks like an address, otherwise null (treated as a search). */
export function normalizeUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input || /\s/.test(input)) return null;
  if (/^silicon:\/\//i.test(input)) return `silicon://${input.slice(10)}`;
  if (/^https?:\/\//i.test(input)) { try { return new URL(input).href; } catch { return null; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[^/]*:\d+(\/|$)/.test(input)) return null; // mailto:, javascript:, ...
  let u: URL;
  try { u = new URL(`https://${input}`); } catch { return null; }
  if (u.username || u.password) return null;
  const h = u.hostname, tld = h.split(".").pop() ?? "";
  const ok = h === "localhost" || h.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
    || (h.includes(".") && /^([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(tld));
  if (!ok) return null;
  return (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h === "localhost" ? `http://${input}` : u.href).replace(/^(http:\/\/[^/?#]+)$/, "$1/");
}

export function normalizeSearchTemplate(raw: string): string | null {
  const input = raw.trim();
  if (!input.includes("%s")) return null;
  const t = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try { return /^https?:$/.test(new URL(t.replace("%s", "test")).protocol) ? t : null; } catch { return null; }
}

export function toUrl(input: string, s: Settings): string {
  const template = (s.searchEngine === "custom" && normalizeSearchTemplate(s.customSearch)) || ENGINES[s.searchEngine]?.url || ENGINES.duckduckgo.url!;
  return normalizeUrl(input) ?? template.replace("%s", encodeURIComponent(input.trim()));
}

export const hostOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
