"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog";
import { useBookmarks } from "@/hooks/useBookmarks";
import { sameUrl, type Bookmark } from "@/lib/bookmarks";
import { hostOf, normalizeUrl } from "@/lib/protocol";

function Form({ bookmark, onClose }: { bookmark: Bookmark; onClose(): void }) {
  const [list, setList] = useBookmarks();
  const [name, setName] = useState(bookmark.title ?? "");
  const [address, setAddress] = useState(bookmark.url);
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(address);
    if (!url || url.startsWith("silicon://")) { setError("Enter a valid website address."); return; }
    const i = list.findIndex((x) => sameUrl(x.url, bookmark.url));
    if (i < 0) { onClose(); return; }
    if (list.some((x, j) => j !== i && sameUrl(x.url, url))) { setError("That address is already in your bookmarks."); return; }
    const entry: Bookmark = { title: name.trim() || hostOf(url), url };
    if (list[i].icon && sameUrl(list[i].url, url)) entry.icon = list[i].icon; // keep its icon unless the address changed
    setList(list.map((x, j) => (j === i ? entry : x)));
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <h2>Edit bookmark</h2>
      <label>Name <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} type="text" autoComplete="off" /></label>
      <label>URL <input value={address} onChange={(e) => setAddress(e.target.value)} type="text" autoComplete="off" spellCheck={false} /></label>
      <p className="error">{error}</p>
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save</button></div>
    </form>
  );
}

export function BookmarkEditDialog({ bookmark, onClose }: { bookmark: Bookmark | null; onClose(): void }) {
  return <Dialog id="bm-edit" open={!!bookmark} onClose={onClose}>{bookmark && <Form key={bookmark.url} bookmark={bookmark} onClose={onClose} />}</Dialog>;
}
