import { shell } from "./shell";

// Everything Silicon saves lives in this origin's localStorage, so a backup is simply all of it.
const FORMAT = 1;
const SETTINGS_KEYS = ["settings", "theme", "cloak"]; // kept by "Clear data", removed by "Reset all settings"

const reload = () => { const s = shell(); if (s) s.reload(); else location.reload(); };

export function exportData(): object {
  const ls: Record<string, string | null> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; ls[k] = localStorage.getItem(k); } } catch {}
  return { app: "silicon", format: FORMAT, exportedAt: new Date().toISOString(), localStorage: ls };
}

/** The entries of a backup file, or throws an Error with a message fit to show. */
export function parseBackup(text: string): [string, string][] {
  let o: { app?: string; format?: number; localStorage?: Record<string, unknown> };
  try { o = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!o || o.app !== "silicon" || !o.localStorage || typeof o.localStorage !== "object" || Array.isArray(o.localStorage)) throw new Error("That isn't a Silicon backup.");
  if ((o.format ?? 0) > FORMAT) throw new Error("This backup is from a newer version of Silicon.");
  const entries = Object.entries(o.localStorage);
  if (entries.length > 5000 || text.length > 5e6) throw new Error("That backup is too large.");
  for (const [k, v] of entries) if (typeof v !== "string" || k.length > 200) throw new Error("That backup has an entry Silicon can't read.");
  return entries as [string, string][];
}

export function importBackup(entries: [string, string][]): void {
  try { localStorage.clear(); for (const [k, v] of entries) localStorage.setItem(k, v); } catch {}
  reload();
}

/** Removes saved data, including proxy caches and cookies, but keeps settings. */
export async function clearData(): Promise<void> {
  try { for (const k of Object.keys(localStorage)) if (!SETTINGS_KEYS.includes(k)) localStorage.removeItem(k); sessionStorage.clear(); } catch {}
  try { for (const name of await caches.keys()) await caches.delete(name); } catch {}
  try { for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name); } catch {}
  setTimeout(reload, 250); // give the database deletions a moment to be issued
}

export function resetSettings(): void {
  try { for (const k of SETTINGS_KEYS) localStorage.removeItem(k); } catch {}
  reload();
}

export function downloadText(text: string, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
