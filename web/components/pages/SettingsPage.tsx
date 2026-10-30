"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { keyName } from "@/components/ShortcutsDialog";
import { usePageClass } from "@/hooks/usePageClass";
import { useSettings } from "@/hooks/useSettings";
import { CLOAKS, cloakIdentity } from "@/hooks/useStealth";
import { clearData, downloadText, exportData, importBackup, parseBackup, resetSettings } from "@/lib/data";
import { ENGINES, normalizeSearchTemplate, normalizeUrl } from "@/lib/protocol";
import { shell } from "@/lib/shell";
import type { Settings } from "@/lib/types";

const SECTIONS = [["appearance", "palette", "Appearance"], ["search", "search", "Search engine"], ["privacy", "lock", "Privacy"], ["proxy", "vpn_lock", "Proxy"], ["data", "database", "Data"], ["about", "info", "About Silicon"]] as const;
type SectionName = (typeof SECTIONS)[number][0];

const Filter = createContext("");

/** One setting. Hidden while the settings search doesn't match it. */
function Row({ t, d, children }: { t: string; d?: ReactNode; children?: ReactNode }) {
  const q = useContext(Filter);
  if (q && !`${t} ${typeof d === "string" ? d : ""}`.toLowerCase().includes(q)) return null;
  return <div className="s-row"><div className="s-label"><div className="t">{t}</div>{d && <div className="d">{d}</div>}</div>{children && <div className="s-ctl">{children}</div>}</div>;
}
const Switch = ({ on, set, label }: { on: boolean; set(v: boolean): void; label: string }) => (
  <label className="switch"><input type="checkbox" aria-label={label} checked={on} onChange={(e) => set(e.target.checked)} /><span /></label>
);
/** A text box that commits when it loses focus, and shows the saved value again if the change is refused. */
function Text({ value, commit, ...rest }: { value: string; commit(v: string): void; id?: string; placeholder?: string; disabled?: boolean; type?: string; "aria-label"?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input {...rest} type={rest.type ?? "text"} spellCheck={false} autoComplete="off" value={draft ?? value} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== null) commit(draft.trim()); setDraft(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

// Game saves live in the backend's browser module, shared with the old frontend.
interface SaveSite { host: string; localStorage: string[]; databases: { name: string; db: string; records: number }[] }
interface Selection { ls: Set<string>; db: Set<string> }
interface SavesModule {
  scan(): Promise<SaveSite[]>;
  buildExport(sel: Selection): Promise<string>;
  parseFile(text: string): SaveSite[];
  importSaves(sites: SaveSite[], sel: Selection): Promise<{ items: number; sites: number; problems: string[] }>;
}
const loadSaves = () => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/js/saves.js" as string) as Promise<SavesModule>;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const today = () => new Date().toISOString().slice(0, 10);

function SavesDialog({ mode, sites, onClose, toast }: { mode: "export" | "import"; sites: SaveSite[]; onClose(): void; toast(m: string): void }) {
  const exporting = mode === "export";
  const [off, setOff] = useState<Set<string>>(() => new Set(sites.flatMap((s) => s.databases.filter((d) => /cache/i.test(d.db)).map((d) => `db:${d.name}`)))); // caches start unticked
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (k: string, on: boolean) => setOff((prev) => { const next = new Set(prev); if (on) next.delete(k); else next.add(k); return next; });
  const selection = (): Selection => {
    const sel: Selection = { ls: new Set(), db: new Set() };
    for (const s of sites) {
      if (!off.has(`ls:${s.host}`)) s.localStorage.forEach((k) => sel.ls.add(k));
      for (const d of s.databases) if (!off.has(`db:${d.name}`)) sel.db.add(d.name);
    }
    return sel;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sel = selection();
    if (!sel.ls.size && !sel.db.size) { setError("Tick at least one item."); return; }
    setBusy(true);
    setError("");
    try {
      const saves = await loadSaves();
      if (exporting) {
        downloadText(await saves.buildExport(sel), `silicon-game-saves-${today()}.json`);
        toast("Game saves downloaded");
        onClose();
      } else {
        const r = await saves.importSaves(sites, sel);
        if (r.problems.length) setError(`Imported ${plural(r.items, "item")}, but not everything: ${r.problems.join("; ")}`);
        else { toast(`Imported ${plural(r.items, "item")} from ${plural(r.sites, "site")}`); onClose(); }
      }
    } catch (err) { setError(`Couldn't finish: ${err instanceof Error ? err.message : err}`); }
    setBusy(false);
  };
  const check = (k: string, label: string, note?: string) => (
    <label key={k} className="sv-row"><input type="checkbox" checked={!off.has(k)} onChange={(e) => toggle(k, e.target.checked)} /><span>{label}</span>{note && <span className="sv-note">{note}</span>}</label>
  );
  return (
    <form onSubmit={submit}>
      <h2>{exporting ? "Export game saves" : "Import game saves"}</h2>
      <p className="sv-intro">{exporting ? "Choose which saves to put in the file." : "Choose which saves to put back. Saves with the same name will be replaced."}</p>
      <div>
        {!sites.length && <p className="sv-empty">{exporting ? "No saves found yet. Play a game through the proxy, then come back." : "That file doesn't have any saves in it."}</p>}
        {sites.map((s) => (
          <div key={s.host} className="sv-site">
            <div className="sv-host">{s.host}</div>
            {s.localStorage.length > 0 && check(`ls:${s.host}`, `Local storage (${plural(s.localStorage.length, "item")})`)}
            {s.databases.map((d) => check(`db:${d.name}`, `Database "${d.db}" (${plural(d.records, "record")})`, /cache/i.test(d.db) ? "Looks like a cache, so it's off by default" : ""))}
          </div>
        ))}
      </div>
      <p className="error">{error}</p>
      <div className="actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy || !sites.length}>{busy ? "Working…" : exporting ? "Export" : "Import"}</button></div>
    </form>
  );
}

const PHRASE = "I want to delete my data";
interface Confirm { title: string; text: string; button: string; typed: boolean; run(): void }

function ConfirmForm({ c, onClose }: { c: Confirm; onClose(): void }) {
  const [typed, setTyped] = useState("");
  const blocked = c.typed && typed !== PHRASE; // Enter can't skip the phrase
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (blocked) return; onClose(); c.run(); }}>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
      {c.typed && <label>Type <b>{PHRASE}</b> to confirm<input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} type="text" autoComplete="off" spellCheck={false} /></label>}
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className={`primary${c.typed ? " danger" : ""}`} disabled={blocked}>{c.button}</button></div>
    </form>
  );
}

export function SettingsPage() {
  usePageClass("settings");
  const { settings: s, update } = useSettings();
  const [section, setSection] = useState<SectionName>("appearance");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const [toastText, setToastText] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [capturing, setCapturing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saves, setSaves] = useState<{ mode: "export" | "import"; sites: SaveSite[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [wispDefault, setWispDefault] = useState("");
  const [engine, setEngine] = useState("Scramjet");
  const backupFile = useRef<HTMLInputElement>(null);
  const savesFile = useRef<HTMLInputElement>(null);

  const toast = (m: string) => {
    setToastText(m);
    setToastOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastOn(false), 1600);
  };
  const save = (patch: Partial<Settings>) => { update(patch); toast("Saved"); };

  useEffect(() => {
    setWispDefault(process.env.NEXT_PUBLIC_WISP_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`);
    const version = (window.parent as Window & { $scramjet?: { versionInfo?: { version?: string } } }).$scramjet?.versionInfo?.version;
    setEngine(`Scramjet ${version ?? "2"}`);
  }, []);

  // Records a new panic key. While recording, the shell ignores key presses so nothing fires by accident.
  useEffect(() => {
    if (!capturing) return;
    shell()?.setCapture(true);
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return; // wait for the real key
      if (e.key !== "Escape") save({ panicKey: { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey } });
      setCapturing(false);
    };
    addEventListener("keydown", key, true);
    return () => {
      removeEventListener("keydown", key, true);
      setTimeout(() => shell()?.setCapture(false), 300); // keep the shell quiet until the key is released
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const preview = cloakIdentity(s).icon;
  const setPanicUrl = (raw: string) => {
    const u = raw ? normalizeUrl(raw) : "https://www.google.com/";
    if (!u || !/^https?:/.test(u)) toast("Enter a valid http(s) address");
    else save({ panicUrl: u });
  };
  const setCustomSearch = (raw: string) => {
    const t = raw ? normalizeSearchTemplate(raw) : "";
    if (t === null) toast("Include %s where the search goes, e.g. example.com/?q=%s");
    else save({ customSearch: t });
  };
  const setCloakIcon = (raw: string) => {
    let url = "";
    try { const u = new URL(raw); if (/^https?:$/.test(u.protocol)) url = u.href; } catch {}
    if (raw && !url) toast("Enter a full address starting with http:// or https://");
    else save({ cloakIcon: url });
  };
  const cover = (kind: "blank" | "blob") => { if (shell()?.openCover(kind) === false) toast("Popup blocked. Allow popups for this site, then try again."); };
  const exportBackup = () => { downloadText(JSON.stringify(exportData(), null, 2), `silicon-backup-${today()}.json`); toast("Backup downloaded"); };
  const chooseBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const entries = parseBackup(await file.text());
      setConfirm({ typed: false, title: "Import this backup?", button: "Import", text: `This replaces your current settings and data with the contents of "${file.name}" (${entries.length} saved items). Silicon will reload.`, run: () => importBackup(entries) });
    } catch (err) { toast(err instanceof Error ? err.message : "Couldn't read that file"); }
  };
  const scanSaves = async () => {
    setScanning(true);
    try { setSaves({ mode: "export", sites: await (await loadSaves()).scan() }); } catch { toast("Couldn't read the saves"); }
    setScanning(false);
  };
  const chooseSaves = async (file: File | undefined) => {
    if (!file) return;
    try { setSaves({ mode: "import", sites: (await loadSaves()).parseFile(await file.text()) }); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't read that file"); }
  };

  const Section = ({ name, children }: { name: SectionName; children: ReactNode }) => <section className={`s-section${q || section === name ? " active" : ""}`}>{children}</section>;

  return (
    <Filter.Provider value={q}>
      <header className="s-header">
        <h1>Settings</h1>
        <label className="s-search"><span className="ms">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} type="text" placeholder="Search settings" autoComplete="off" spellCheck={false} /></label>
      </header>
      <div className="s-body">
        <nav className="s-nav">
          {SECTIONS.map(([name, icon, label]) => <button key={name} className={section === name ? "active" : undefined} onClick={() => { setQuery(""); setSection(name); }}><span className="ms">{icon}</span>{label}</button>)}
        </nav>
        <main className="s-main">
          {Section({ name: "appearance", children: <>
            <h2>Appearance</h2>
            <div className="s-card">
              <Row t="Theme" d="Choose how Silicon looks. System follows your device."><select aria-label="Theme" value={s.theme} onChange={(e) => save({ theme: e.target.value as Settings["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></Row>
              <Row t="Show bookmarks bar" d="A row of your bookmarks under the address bar. It only appears when you have bookmarks. Ctrl+Shift+B turns it on and off."><Switch label="Show bookmarks bar" on={s.showBookmarksBar} set={(v) => save({ showBookmarksBar: v })} /></Row>
            </div>
          </> })}
          {Section({ name: "search", children: <>
            <h2>Search engine</h2>
            <div className="s-card">
              <Row t="Search engine used in the address bar" d="Used when what you type isn't a web address."><select aria-label="Search engine" value={s.searchEngine} onChange={(e) => save({ searchEngine: e.target.value })}>{Object.entries(ENGINES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Row>
              {s.searchEngine === "custom" && <Row t="Custom search address" d={<>Write the address of your search engine and put <b>%s</b> where your search should go, for example <b>example.com/?q=%s</b>. Without %s it won't work.</>}><Text aria-label="Custom search address" value={s.customSearch} commit={setCustomSearch} placeholder="example.com/?q=%s" /></Row>}
            </div>
          </> })}
          {Section({ name: "privacy", children: <>
            <h2>Panic key</h2>
            <div className="s-card">
              <Row t="Enable panic key" d="Pressing the key immediately stops everything and sends this tab to the panic site. Works on every page, including sites you're browsing. Off by default."><Switch label="Enable panic key" on={s.panicEnabled} set={(v) => save({ panicEnabled: v })} /></Row>
              <Row t="Panic key" d="Click the button, then press the key or combination you want. Esc cancels.">
                <span className="s-inline"><button id="panic-key" className="s-btn" disabled={!s.panicEnabled} onClick={() => setCapturing(true)} onBlur={() => setCapturing(false)}>{capturing ? "Press a key…" : s.panicKey ? keyName(s.panicKey, " + ") : "Not set"}</button><button className="s-link" disabled={!s.panicEnabled} onClick={() => save({ panicKey: null })}>Clear</button></span>
              </Row>
              <Row t="Panic site" d="Where you're sent. Must be an http(s) address."><Text aria-label="Panic site" value={s.panicUrl} commit={setPanicUrl} disabled={!s.panicEnabled} placeholder="https://www.google.com/" /></Row>
              <Row t="Open in about:blank" d="Opens Silicon in a new about:blank window and sends this tab to the panic site. Allow pop-ups if your browser blocks it. Your open tabs don't carry over."><button className="s-btn" onClick={() => cover("blank")}>Open</button></Row>
              <Row t="Open in blob:" d="Same as above, but the new window uses a blob: address."><button className="s-btn" onClick={() => cover("blob")}>Open</button></Row>
              <Row t="Auto cover" d="The first time you press a key on the front page (new tab), it opens in about:blank and this tab goes to the panic site. Mouse clicks don't count, and typing in Settings doesn't trigger it. Off by default."><Switch label="Auto cover" on={s.autoCover} set={(v) => save({ autoCover: v })} /></Row>
            </div>
            <h2>Tab cloak</h2>
            <div className="s-card">
              <Row t="Tab cloak" d="When this window loses focus, the tab title and icon change to look like this site. Each icon is loaded from the site itself.">
                <span className="s-inline">{s.cloak !== "silicon" && <img className="s-fav" alt="" width={20} height={20} src={preview} />}<select aria-label="Tab cloak" value={s.cloak} onChange={(e) => save({ cloak: e.target.value })}>{Object.entries(CLOAKS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></span>
              </Row>
              <Row t="Always show cloak" d="Keep the cloak on even while you're using Silicon, not only when the window loses focus. Off by default."><Switch label="Always show cloak" on={s.cloakAlways} set={(v) => save({ cloakAlways: v })} /></Row>
              {s.cloak === "custom" && <>
                <Row t="Icon address" d="Required. The full web address of the icon image, for example https://example.com/favicon.ico. Silicon doesn't look icons up for you."><Text aria-label="Icon address" type="url" value={s.cloakIcon} commit={setCloakIcon} placeholder="https://example.com/favicon.ico" /></Row>
                <Row t="Custom title" d="Required. The tab title to show. The custom cloak only works once both the title and the icon address are set."><Text aria-label="Custom title" value={s.cloakTitle} commit={(v) => save({ cloakTitle: v })} /></Row>
              </>}
            </div>
            <h2>History</h2>
            <div className="s-card"><Row t="Save browsing history" d="Keep a list of the pages you open, shown on silicon://history. It stays in this browser. Turning this off doesn't delete what's already saved."><Switch label="Save browsing history" on={s.saveHistory} set={(v) => save({ saveHistory: v })} /></Row></div>
            <h2>Leaving</h2>
            <div className="s-card"><Row t="Confirm before leaving" d="Ask before this tab is closed or reloaded. The panic key ignores this. Off by default."><Switch label="Confirm before leaving" on={s.confirmLeave} set={(v) => save({ confirmLeave: v })} /></Row></div>
          </> })}
          {Section({ name: "proxy", children: <>
            <h2>Proxy</h2>
            <div className="s-card">
              <Row t="Transport" d="How proxied traffic leaves the Wisp server. Epoxy is the default; libcurl is an alternative that supports an upstream proxy."><select aria-label="Transport" value={s.transport} onChange={(e) => save({ transport: e.target.value as Settings["transport"] })}><option value="epoxy">Epoxy (default)</option><option value="libcurl">libcurl</option></select></Row>
              <Row t="Proxy games" d="Load games from their own servers (like Selenite) through the proxy, which helps when those sites are blocked. Games hosted by Silicon are never proxied, and emulator games load directly for now because they don't run through the proxy. You can switch any game with the shield button in the player."><Switch label="Proxy games" on={s.proxyGames} set={(v) => save({ proxyGames: v })} /></Row>
              <Row t="Wisp server" d="WebSocket address of the Wisp server. Leave empty to use the one built into this server."><Text aria-label="Wisp server" value={s.wisp} commit={(v) => save({ wisp: v })} placeholder={wispDefault} /></Row>
              <Row t="Upstream proxy" d="Optional SOCKS5 or HTTP proxy for the transport, e.g. socks5h://localhost:9050 for Tor. Requires the libcurl transport."><Text aria-label="Upstream proxy" value={s.proxy} commit={(v) => save({ proxy: v })} disabled={s.transport !== "libcurl"} placeholder="None" /></Row>
              <Row t="Reset proxy settings" d="Restore the transport, Wisp server and upstream proxy to their defaults."><button className="s-link" onClick={() => save({ transport: "epoxy", wisp: "", proxy: "", proxyGames: true })}>Reset</button></Row>
            </div>
          </> })}
          {Section({ name: "data", children: <>
            <h2>Backup</h2>
            <div className="s-card">
              <Row t="Export data" d="Download everything Silicon has saved (settings, bookmarks, history, favorites, recently played, and games' local storage) as one JSON file. Saves that games keep in IndexedDB aren't in it; see Game saves below. It may include your panic key and site, so keep it private."><button className="s-btn" onClick={exportBackup}>Export</button></Row>
              <Row t="Import data" d="Restore from a backup file. This replaces your current settings and data. Only import files you exported yourself."><button className="s-btn" onClick={() => backupFile.current?.click()}>Import…</button></Row>
            </div>
            <h2>Game saves</h2>
            <div className="s-card">
              <Row t="Export game saves" d="Download the saves games keep in this browser (their local storage and IndexedDB data) as a file. The backup above only covers local storage, so use this for games that keep saves in IndexedDB."><button className="s-btn" disabled={scanning} onClick={scanSaves}>Choose…</button></Row>
              <Row t="Import game saves" d="Put saves from a file back into this browser. Saves with the same name are replaced; everything else is kept. Close any open game tabs first. Only import files you exported yourself."><button className="s-btn" onClick={() => savesFile.current?.click()}>Import…</button></Row>
            </div>
            <h2 className="danger-h">Danger zone</h2>
            <div className="s-card danger">
              <Row t="Clear data" d="Deletes your shortcuts, browsing history, favorites, recently played, saved game data, and cached proxy data (cookies and site storage). Your settings are kept. This can't be undone."><button className="s-btn danger" onClick={() => setConfirm({ typed: true, title: "Clear data?", button: "Clear data", text: "This permanently deletes your shortcuts, favorites, recently played, saved game data and cached proxy data. Settings are kept.", run: () => void clearData() })}>Clear data…</button></Row>
              <Row t="Reset all settings" d="Puts every setting back to its default (theme, search engine, privacy options, panic key, proxy). Your data is kept. This can't be undone."><button className="s-btn danger" onClick={() => setConfirm({ typed: true, title: "Reset all settings?", button: "Reset settings", text: "This puts every setting back to its default, including your panic key, cloak and proxy options. Your data is kept.", run: resetSettings })}>Reset settings…</button></Row>
            </div>
          </> })}
          {Section({ name: "about", children: <>
            <h2>About Silicon</h2>
            <div className="s-card">
              <Row t="Silicon" d="A simple browser and games launcher." />
              <Row t="Version" d="v0.3 · beta" />
              <Row t="Proxy engine" d={engine} />
              <Row t="License" d="GNU Affero General Public License v3.0" />
              <Row t="Source code" d="Silicon is open source. The code, issues and releases are on GitHub."><button className="s-btn" onClick={() => window.open("https://github.com/Carbonine/silicon", "_blank", "noopener")}>Open on GitHub</button></Row>
            </div>
            <h2>Credits</h2>
            <div className="s-card">
              <Row t="Carbonine" d="Developers" />
              <Row t="Mercury Workshop" d="Proxy developers" />
            </div>
          </> })}
          <div className="s-empty">No settings found</div>
        </main>
      </div>
      <input ref={backupFile} type="file" accept="application/json,.json" hidden onChange={(e) => { void chooseBackup(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={savesFile} type="file" accept="application/json,.json" hidden onChange={(e) => { void chooseSaves(e.target.files?.[0]); e.target.value = ""; }} />
      <Dialog className="wide" open={!!saves} onClose={() => setSaves(null)}>{saves && <SavesDialog mode={saves.mode} sites={saves.sites} onClose={() => setSaves(null)} toast={toast} />}</Dialog>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>{confirm && <ConfirmForm c={confirm} onClose={() => setConfirm(null)} />}</Dialog>
      <div className={`s-toast${toastOn ? " show" : ""}`}>{toastText}</div>
    </Filter.Provider>
  );
}
