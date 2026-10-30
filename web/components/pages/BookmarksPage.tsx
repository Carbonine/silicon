"use client";

import { useLocalStorage } from "@/hooks/useLocalStorage";
import { hostOf } from "@/lib/protocol";
import { goTo } from "@/lib/shell";
import { KEYS } from "@/lib/storage";

interface Bookmark { title: string; url: string; icon?: string }

export function BookmarksPage() {
  const [list, setList] = useLocalStorage<Bookmark[]>(KEYS.bookmarks, []);
  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="border-b border-border px-6 py-4"><h1 className="text-2xl">Bookmarks</h1></header>
      <ul className="mx-auto flex max-w-3xl flex-col p-6">
        {!list.length && <li className="text-muted">No bookmarks yet.</li>}
        {list.map((b) => (
          <li key={b.url} className="flex items-center gap-3 border-b border-border py-2">
            <button onClick={() => goTo(b.url)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">{b.title} <span className="text-muted">{hostOf(b.url)}</span></button>
            <button aria-label={`Delete ${b.title}`} onClick={() => setList((p) => p.filter((x) => x.url !== b.url))} className="grid size-8 place-items-center rounded-full text-icon hover:bg-hover"><span className="ms">delete</span></button>
          </li>
        ))}
      </ul>
    </main>
  );
}
