"use client";

import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageClass } from "@/hooks/usePageClass";
import { useSettings } from "@/hooks/useSettings";
import { useSlashSearch } from "@/hooks/useSlashSearch";
import { hostOf } from "@/lib/protocol";
import { openLink } from "@/lib/shell";
import { KEYS, type HistoryEntry } from "@/lib/storage";

const STEP = 150;

function dayLabel(ts: number): string {
  const d = new Date(ts), today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function HistoryPage() {
  usePageClass("games-page");
  const search = useSlashSearch();
  const { settings } = useSettings();
  const [list, setList] = useLocalStorage<HistoryEntry[]>(KEYS.history, []);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);
  const [clearing, setClearing] = useState(false);
  const [range, setRange] = useState("all");
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const all = [...list].sort((a, b) => b.ts - a.ts); // newest first, whatever order they were saved or imported in
    return needle ? all.filter((x) => `${x.t} ${x.u}`.toLowerCase().includes(needle)) : all;
  }, [list, needle]);
  const groups = useMemo(() => {
    const out: { label: string; rows: HistoryEntry[] }[] = [];
    for (const item of items.slice(0, shown)) {
      const label = dayLabel(item.ts);
      if (out[out.length - 1]?.label !== label) out.push({ label, rows: [] });
      out[out.length - 1].rows.push(item);
    }
    return out;
  }, [items, shown]);
  const open = (h: HistoryEntry, e: MouseEvent) => openLink(h.u, e);
  const clear = (e: FormEvent) => {
    e.preventDefault();
    const since = Date.now() - (range === "hour" ? 36e5 : 864e5);
    setList((l) => (range === "all" ? [] : l.filter((x) => x.ts < since)));
    setClearing(false);
  };

  return (
    <>
      <header className="g-header">
        <h1>History</h1>
        <label className="g-search"><span className="ms">search</span><input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setShown(STEP); }} type="text" placeholder="Search history" autoComplete="off" spellCheck={false} /><kbd>/</kbd></label>
        <div className="g-tools"><button className="s-btn" disabled={!list.length} onClick={() => setClearing(true)}>Clear browsing data…</button></div>
      </header>
      <main className="h-main">
        <div>
          {groups.map((g) => (
            <section key={g.label} className="h-group">
              <h2>{g.label}</h2>
              <div className="h-card">
                {g.rows.map((h) => (
                  <div key={`${h.ts}-${h.u}`} className="h-row">
                    <span className="h-time">{timeLabel(h.ts)}</span>
                    <span className="h-ico"><span className="ms">public</span></span>
                    <button className="h-main-btn" title={h.u} onClick={(e) => open(h, e)} onAuxClick={(e) => { if (e.button === 1) open(h, e); }}><span className="h-title">{h.t || hostOf(h.u)}</span><span className="h-host">{hostOf(h.u)}</span></button>
                    <button className="h-x" title="Remove from history" aria-label="Remove from history" onClick={() => setList((l) => l.filter((x) => !(x.u === h.u && x.ts === h.ts)))}><span className="ms">close</span></button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        {items.length > shown && <button id="more" className="s-link" onClick={() => setShown(shown + STEP)}>Show more ({items.length - shown} left)</button>}
        {!items.length && <div className="g-empty"><span className="ms">history</span><p>{needle ? "Nothing in your history matches that." : settings.saveHistory ? "No history yet. Pages you open will show up here." : "History is turned off, so nothing is being saved. You can turn it on in Settings."}</p></div>}
      </main>
      <Dialog id="clear-dialog" open={clearing} onClose={() => setClearing(false)}>
        <form onSubmit={clear}>
          <h2>Clear browsing history</h2>
          {[["hour", "Last hour"], ["day", "Last 24 hours"], ["all", "All time"]].map(([value, label]) => (
            <label key={value} className="h-radio"><input type="radio" name="range" value={value} checked={range === value} onChange={() => setRange(value)} /> {label}</label>
          ))}
          <p className="h-note">This only clears the list on this page. Cookies, site data and your settings are kept (Settings has a Clear data option for those).</p>
          <div className="actions"><button type="button" onClick={() => setClearing(false)}>Cancel</button><button type="submit" className="primary">Clear history</button></div>
        </form>
      </Dialog>
    </>
  );
}
