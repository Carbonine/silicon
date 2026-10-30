import type { Settings } from "./types";

// The same keys and shapes as the old frontend, so a Silicon backup imports unchanged.
export const KEYS = { settings: "settings", theme: "theme", cloak: "cloak", bookmarks: "bookmarks:list", shortcuts: "bookmarks", history: "history", favs: "games:favs", recent: "games:recent" } as const;

export const DEFAULT_SETTINGS: Settings = {
  transport: "epoxy", wisp: "", proxy: "", searchEngine: "duckduckgo", customSearch: "", theme: "dark",
  cloak: "silicon", cloakIcon: "", cloakTitle: "", cloakAlways: false,
  panicEnabled: false, panicKey: { key: "`" }, panicUrl: "https://www.google.com/",
  autoCover: false, confirmLeave: false, proxyGames: true, saveHistory: true, showBookmarksBar: true,
};

// Storage can throw (private windows, blocked site data), so every read and write is guarded.
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T) ?? fallback;
  } catch { return fallback; }
}
export function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(KEYS.settings, {}) });

export interface HistoryEntry { u: string; t: string; ts: number }
const HISTORY_MAX = 1000;
export function recordVisit(url: string, title: string): void {
  if (!loadSettings().saveHistory || !/^https?:\/\//i.test(url)) return;
  const list = readJson<HistoryEntry[]>(KEYS.history, []);
  const last = list[list.length - 1], now = Date.now();
  if (last && last.u === url && now - last.ts < 30 * 60 * 1000) { last.t = title || last.t; last.ts = now; } // a reload, not a new visit
  else list.push({ u: url, t: title, ts: now });
  writeJson(KEYS.history, list.slice(-HISTORY_MAX));
}
