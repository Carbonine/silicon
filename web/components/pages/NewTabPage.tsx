"use client";

import { useState, type FormEvent } from "react";
import { goTo } from "@/lib/shell";

export function NewTabPage() {
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) goTo(q); };
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-4 text-text">
      <h1 className="text-5xl font-semibold text-(--wordmark)">Silicon</h1>
      <form onSubmit={submit} className="flex h-12 w-full max-w-xl items-center gap-3 rounded-full bg-field px-4">
        <span className="ms text-icon">search</span>
        <input aria-label="Search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or enter address" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
      </form>
      <button onClick={() => goTo("silicon://games")} className="flex items-center gap-2 rounded-full bg-tile px-4 py-2 text-sm hover:bg-field-hover"><span className="ms">sports_esports</span>Games</button>
    </main>
  );
}
