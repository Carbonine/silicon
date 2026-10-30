"use client";

import { useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { hostOf } from "@/lib/protocol";
import { goTo } from "@/lib/shell";
import { KEYS, type HistoryEntry } from "@/lib/storage";

export function HistoryPage() {
  const [list, setList] = useLocalStorage<HistoryEntry[]>(KEYS.history, []);
  const sorted = useMemo(() => [...list].sort((a, b) => b.ts - a.ts), [list]);
  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-2xl">History</h1>
        {list.length > 0 && <button onClick={() => setList([])} className="rounded-full bg-tile px-4 py-1.5 text-sm hover:bg-field-hover">Clear history</button>}
      </header>
      <ul className="mx-auto flex max-w-3xl flex-col p-6">
        {!sorted.length && <li className="text-muted">Nothing here yet.</li>}
        {sorted.map((h) => (
          <li key={`${h.ts}-${h.u}`} className="flex items-center gap-3 border-b border-border py-2">
            <time className="w-36 shrink-0 text-xs text-muted">{new Date(h.ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time>
            <button onClick={() => goTo(h.u)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">{h.t || h.u} <span className="text-muted">{hostOf(h.u)}</span></button>
            <button aria-label="Remove" onClick={() => setList((p) => p.filter((x) => !(x.ts === h.ts && x.u === h.u)))} className="grid size-8 place-items-center rounded-full text-icon hover:bg-hover"><span className="ms">close</span></button>
          </li>
        ))}
      </ul>
    </main>
  );
}
