"use client";

import { useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { useBookmarks } from "@/hooks/useBookmarks";
import { usePageClass } from "@/hooks/usePageClass";
import { useSlashSearch } from "@/hooks/useSlashSearch";
import { sameUrl, type Bookmark } from "@/lib/bookmarks";
import { hostOf, normalizeUrl } from "@/lib/protocol";
import { openLink } from "@/lib/shell";

function BookmarkForm({ list, index, onSave, onClose }: { list: Bookmark[]; index: number; onSave(next: Bookmark[]): void; onClose(): void }) {
  const current = index >= 0 ? list[index] : null;
  const [name, setName] = useState(current?.title ?? "");
  const [address, setAddress] = useState(current?.url ?? "");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(address);
    if (!url || url.startsWith("silicon://")) { setError("Enter a valid website address."); return; }
    if (list.some((x, i) => i !== index && sameUrl(x.url, url))) { setError("That address is already in your bookmarks."); return; }
    const entry: Bookmark = { title: name.trim() || hostOf(url), url };
    if (current?.icon && sameUrl(current.url, url)) entry.icon = current.icon; // keep its icon unless the address changed
    onSave(current ? list.map((x, i) => (i === index ? entry : x)) : [...list, entry]);
    onClose();
  };
  return (
    <form onSubmit={submit}>
      <h2>{current ? "Edit bookmark" : "Add bookmark"}</h2>
      <label>Name <input autoFocus={!!current} value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Optional" autoComplete="off" /></label>
      <label>URL <input autoFocus={!current} value={address} onChange={(e) => setAddress(e.target.value)} type="text" placeholder="example.com" autoComplete="off" spellCheck={false} /></label>
      <p className="error">{error}</p>
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save</button></div>
    </form>
  );
}

export function BookmarksPage() {
  usePageClass("games-page");
  const search = useSlashSearch();
  const [list, setList] = useBookmarks();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null); // -1 adds a new one
  const [dragFrom, setDragFrom] = useState(-1);
  const [gripped, setGripped] = useState(-1); // a row is only draggable while its handle is held
  const [drop, setDrop] = useState<{ i: number; after: boolean } | null>(null);
  const needle = q.trim().toLowerCase();
  const items = list.map((b, i) => ({ b, i })).filter(({ b }) => !needle || `${b.title} ${b.url}`.toLowerCase().includes(needle));
  const canMove = !needle;

  const move = (from: number, to: number) => {
    const at = Math.max(0, Math.min(list.length - 1, to));
    if (from < 0 || from >= list.length || at === from) return;
    const next = [...list];
    next.splice(at, 0, next.splice(from, 1)[0]);
    setList(next);
  };
  const after = (e: DragEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  const endDrag = () => { setDragFrom(-1); setGripped(-1); setDrop(null); };
  const open = (b: Bookmark, e: MouseEvent) => openLink(b.url, e);

  return (
    <>
      <header className="g-header">
        <h1>Bookmarks</h1>
        <label className="g-search"><span className="ms">search</span><input ref={search} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Search bookmarks" autoComplete="off" spellCheck={false} /><kbd>/</kbd></label>
        <div className="g-tools"><button className="s-btn" onClick={() => setEditing(-1)}>Add bookmark</button></div>
      </header>
      <main className="h-main">
        {list.length > 0 && !needle && <p className="b-hint">Drag to reorder. Bookmarks show in the bar under the address bar, in this order.</p>}
        {items.length > 0 && (
          <div className="h-card">
            {items.map(({ b, i }) => (
              <div
                key={b.url} draggable={canMove && gripped === i}
                className={`h-row b-row${canMove ? "" : " no-move"}${dragFrom === i ? " dragging" : ""}${drop?.i === i ? (drop.after ? " drop-after" : " drop-before") : ""}`}
                onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragEnd={endDrag}
                onDragOver={(e) => { if (dragFrom >= 0) { e.preventDefault(); setDrop({ i, after: after(e) }); } }}
                onDrop={(e) => {
                  if (dragFrom < 0) return;
                  e.preventDefault();
                  let to = i + (after(e) ? 1 : 0);
                  if (dragFrom < to) to--;
                  move(dragFrom, to);
                }}
              >
                <span className="b-grip" title="Drag to reorder" onPointerDown={() => setGripped(i)} onPointerUp={() => setGripped(-1)}><span className="ms">drag_indicator</span></span>
                <span className="h-ico">{b.icon ? <img className="b-img" alt="" src={b.icon} /> : <span className="ms">public</span>}</span>
                <button className="h-main-btn" title={b.url} onClick={(e) => open(b, e)} onAuxClick={(e) => { if (e.button === 1) open(b, e); }}><span className="h-title">{b.title || hostOf(b.url)}</span><span className="h-host">{hostOf(b.url)}</span></button>
                <span className="b-acts">
                  <button className="h-x up" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><span className="ms">arrow_upward</span></button>
                  <button className="h-x down" title="Move down" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}><span className="ms">arrow_downward</span></button>
                  <button className="h-x edit" title="Edit" aria-label="Edit" onClick={() => setEditing(i)}><span className="ms">edit</span></button>
                  <button className="h-x del" title="Delete" aria-label="Delete" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><span className="ms">close</span></button>
                </span>
              </div>
            ))}
          </div>
        )}
        {!items.length && <div className="g-empty"><span className="ms">bookmark</span><p>{needle ? "No bookmarks match your search." : "No bookmarks yet. Add one here, or use the star in the address bar. They’ll show in a bar under the address bar."}</p></div>}
      </main>
      <Dialog id="bm-dialog" open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && <BookmarkForm key={editing} list={list} index={editing} onSave={setList} onClose={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
