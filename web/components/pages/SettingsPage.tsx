"use client";

import { useState, type ReactNode } from "react";
import { useSettings } from "@/hooks/useSettings";
import { CLOAKS } from "@/hooks/useStealth";
import { ENGINES } from "@/lib/protocol";
import { shell } from "@/lib/shell";
import type { Settings } from "@/lib/types";

const field = "h-9 min-w-0 rounded-lg bg-field px-3 text-sm text-text outline-none";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="min-w-48"><span className="block text-sm">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      {children}
    </label>
  );
}
const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section><h2 className="mb-2 text-sm text-muted">{title}</h2><div className="rounded-xl border border-border bg-card">{children}</div></section>
);

export function SettingsPage() {
  const { settings: s, update } = useSettings();
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update({ [key]: value } as Partial<Settings>);
  const capture = (on: boolean) => { setCapturing(on); shell()?.setCapture(on); };
  const cover = (kind: "blank" | "blob") => { if (shell()?.openCover(kind) === false) setNotice("Popup blocked. Allow popups for this site, then try again."); };

  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-10 border-b border-border bg-bg px-6 py-4"><h1 className="text-2xl">Settings</h1></header>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card title="Appearance">
          <Row label="Theme"><select className={field} value={s.theme} onChange={(e) => set("theme", e.target.value as Settings["theme"])}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></Row>
        </Card>
        <Card title="Search">
          <Row label="Search engine"><select className={field} value={s.searchEngine} onChange={(e) => set("searchEngine", e.target.value)}>{Object.entries(ENGINES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Row>
          {s.searchEngine === "custom" && <Row label="Custom search address" hint="Use %s where the search goes."><input className={field} value={s.customSearch} onChange={(e) => set("customSearch", e.target.value)} placeholder="example.com/?q=%s" /></Row>}
        </Card>
        <Card title="Privacy">
          <Row label="Tab cloak" hint="Changes the tab's title and icon when the window loses focus."><select className={field} value={s.cloak} onChange={(e) => set("cloak", e.target.value)}>{Object.entries(CLOAKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Row>
          {s.cloak === "custom" && <>
            <Row label="Icon address"><input className={field} value={s.cloakIcon} onChange={(e) => set("cloakIcon", e.target.value)} placeholder="https://…" /></Row>
            <Row label="Custom title"><input className={field} value={s.cloakTitle} onChange={(e) => set("cloakTitle", e.target.value)} /></Row>
          </>}
          <Row label="Always show cloak"><input type="checkbox" checked={s.cloakAlways} onChange={(e) => set("cloakAlways", e.target.checked)} /></Row>
          <Row label="Panic key" hint="One key press leaves Silicon, on every page."><input type="checkbox" checked={s.panicEnabled} onChange={(e) => set("panicEnabled", e.target.checked)} /></Row>
          <Row label="Key">
            <input
              aria-label="Panic key" readOnly className={`${field} w-32 text-center`} value={capturing ? "Press a key…" : s.panicKey?.key ?? ""}
              onFocus={() => capture(true)} onBlur={() => capture(false)}
              onKeyDown={(e) => {
                e.preventDefault();
                if (["Control", "Alt", "Shift", "Meta", "Tab"].includes(e.key)) return;
                set("panicKey", { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
                e.currentTarget.blur();
              }}
            />
          </Row>
          <Row label="Panic site"><input className={field} value={s.panicUrl} onChange={(e) => set("panicUrl", e.target.value)} /></Row>
          <Row label="Cover window" hint="Opens Silicon inside a blank window, then sends this tab to the panic site.">
            <span className="flex gap-2"><button type="button" onClick={() => cover("blank")} className="rounded-full bg-tile px-4 py-1.5 text-sm hover:bg-field-hover">about:blank</button><button type="button" onClick={() => cover("blob")} className="rounded-full bg-tile px-4 py-1.5 text-sm hover:bg-field-hover">blob:</button></span>
          </Row>
          <Row label="Confirm before leaving"><input type="checkbox" checked={s.confirmLeave} onChange={(e) => set("confirmLeave", e.target.checked)} /></Row>
          <Row label="Save browsing history"><input type="checkbox" checked={s.saveHistory} onChange={(e) => set("saveHistory", e.target.checked)} /></Row>
        </Card>
        <Card title="Proxy">
          <Row label="Transport"><select className={field} value={s.transport} onChange={(e) => set("transport", e.target.value as Settings["transport"])}><option value="epoxy">Epoxy</option><option value="libcurl">libcurl</option></select></Row>
          <Row label="Wisp server" hint="Leave empty to use this site's own."><input className={field} value={s.wisp} onChange={(e) => set("wisp", e.target.value)} placeholder="wss://…" /></Row>
          <Row label="Upstream proxy" hint="libcurl only. SOCKS5 or HTTP."><input className={field} value={s.proxy} onChange={(e) => set("proxy", e.target.value)} placeholder="socks5h://…" /></Row>
          <Row label="Load games through the proxy"><input type="checkbox" checked={s.proxyGames} onChange={(e) => set("proxyGames", e.target.checked)} /></Row>
        </Card>
        {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
      </div>
    </main>
  );
}
