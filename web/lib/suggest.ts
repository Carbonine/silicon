import type { Bookmark } from "./bookmarks";
import { ENGINES, hostOf, normalizeUrl } from "./protocol";
import { KEYS, readJson, type HistoryEntry } from "./storage";
import type { Settings } from "./types";

export interface Suggestion { icon: string; img?: string; main: string; sub: string; url?: string; search?: boolean }

const PAGES: Record<string, string> = { games: "sports_esports", bookmarks: "bookmarks", history: "history", settings: "settings" };

// Matches what you type against bookmarks, history and silicon:// pages, on this device only. Nothing typed is sent
// anywhere until Enter, which is why there are no suggestions from a search engine.
export function buildSuggestions(raw: string, settings: Settings): Suggestion[] {
  const q = raw.trim();
  if (!q) return [];
  const lq = q.toLowerCase(), direct = normalizeUrl(q), seen = new Set<string>();
  const out: Suggestion[] = [direct
    ? { icon: "arrow_forward", main: q, sub: "Go to this address", url: direct }
    : { icon: "search", main: q, sub: `Search with ${ENGINES[settings.searchEngine]?.label ?? "your search engine"}`, search: true }];
  if (direct) seen.add(direct);
  const score = (title: string, url: string) => {
    const host = hostOf(url).toLowerCase(), t = title.toLowerCase();
    if (host.startsWith(lq) || url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").startsWith(lq)) return 3;
    if (t.startsWith(lq)) return 2;
    return host.includes(lq) || t.includes(lq) || url.toLowerCase().includes(lq) ? 1 : 0;
  };
  const found: (Suggestion & { url: string; sc: number })[] = [];
  for (const b of readJson<Bookmark[]>(KEYS.bookmarks, [])) {
    const sc = score(b.title ?? "", b.url);
    if (sc) found.push({ icon: "star", img: b.icon, main: b.title || hostOf(b.url), sub: b.url, url: b.url, sc: sc + 0.5 });
  }
  const history = readJson<HistoryEntry[]>(KEYS.history, []);
  for (let i = history.length - 1; i >= 0 && found.length < 80; i--) {
    const h = history[i], sc = score(h.t ?? "", h.u);
    if (sc) found.push({ icon: "history", main: h.t || hostOf(h.u), sub: h.u, url: h.u, sc });
  }
  for (const [name, icon] of Object.entries(PAGES)) {
    const address = `silicon://${name}`;
    if (lq.length >= 2 && (name.startsWith(lq) || address.startsWith(lq))) found.push({ icon, main: name[0].toUpperCase() + name.slice(1), sub: address, url: address, sc: 3 });
  }
  found.sort((a, b) => b.sc - a.sc); // stable: bookmarks first, then the newest history among equals
  for (const f of found) {
    if (out.length >= 7) break;
    if (seen.has(f.url) || seen.has(new URL(f.url, "https://x").href)) continue;
    seen.add(f.url);
    out.push(f);
  }
  return out;
}
