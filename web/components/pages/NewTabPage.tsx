"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageClass } from "@/hooks/usePageClass";
import { hostOf, normalizeUrl } from "@/lib/protocol";
import { goTo } from "@/lib/shell";
import { KEYS } from "@/lib/storage";

interface Shortcut { title: string; url: string }

// The site's own icon, found and fetched by the backend (server/icons.js).
const siteIcon = (url: string) => `/api/site-icon?u=${encodeURIComponent(new URL(url).origin)}`;
const delay = (i: number) => ({ "--d": `${0.08 + i * 0.03}s` }) as CSSProperties;

function Icon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="ms">public</span> : <img alt="" width={28} height={28} src={siteIcon(url)} onError={() => setFailed(true)} />;
}
function Tile({ i, title, circle, onClick, onRemove }: { i: number; title: string; circle: ReactNode; onClick(): void; onRemove?(): void }) {
  return (
    <div className="shortcut-wrap rise" style={delay(i)}>
      <button className="shortcut" onClick={onClick}>{circle}<span className="label">{title}</span></button>
      {onRemove && <button className="remove" title="Remove" aria-label={`Remove ${title}`} onClick={onRemove}><span className="ms">close</span></button>}
    </div>
  );
}

function AddForm({ onAdd, onClose }: { onAdd(s: Shortcut): void; onClose(): void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(address);
    if (!url || url.startsWith("silicon://")) { setError("Enter a valid website address."); return; }
    onAdd({ title: name.trim() || hostOf(url), url });
    onClose();
  };
  return (
    <form onSubmit={submit}>
      <h2>Add shortcut</h2>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Optional" autoComplete="off" /></label>
      <label>URL <input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} type="text" placeholder="example.com" autoComplete="off" spellCheck={false} /></label>
      <p className="error">{error}</p>
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save</button></div>
    </form>
  );
}

export function NewTabPage() {
  usePageClass("ntp");
  const [q, setQ] = useState("");
  const [list, setList] = useLocalStorage<Shortcut[]>(KEYS.shortcuts, []);
  const [adding, setAdding] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) goTo(q); };

  return (
    <div className="newtab">
      <div className="wordmark rise">Silicon</div>
      <form className="search-form rise" style={{ "--d": ".04s" } as CSSProperties} autoComplete="off" onSubmit={submit}>
        <span className="ms">search</span>
        <input autoFocus type="text" placeholder="Search or enter a URL" aria-label="Search or enter a URL" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="shortcuts">
        <Tile i={0} title="Games" circle={<span className="circle"><span className="ms">sports_esports</span></span>} onClick={() => goTo("silicon://games")} />
        {ready && list.map((s, i) => <Tile key={s.url} i={i + 1} title={s.title} circle={<span className="circle"><Icon url={s.url} /></span>} onClick={() => goTo(s.url)} onRemove={() => setList((l) => l.filter((_, j) => j !== i))} />)}
        <Tile i={list.length + 1} title="Add shortcut" circle={<span className="circle add"><span className="ms">add</span></span>} onClick={() => setAdding(true)} />
      </div>
      <Dialog id="add-dialog" open={adding} onClose={() => setAdding(false)}>
        <AddForm onAdd={(s) => setList((l) => [...l, s])} onClose={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}
