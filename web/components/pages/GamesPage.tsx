"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { KEYS } from "@/lib/storage";
import { goTo } from "@/lib/shell";
import type { GameSourceInfo, SiliconGame } from "@/lib/types";

const PAGE_SIZE = 120;

function GameTile({ game }: { game: SiliconGame }) {
  return (
    <button onClick={() => goTo(`silicon://play/${encodeURIComponent(game.id)}`)} title={game.title} className="group overflow-hidden rounded-xl bg-card text-left hover:bg-field-hover">
      <div className="grid aspect-video place-items-center overflow-hidden bg-tile text-2xl font-semibold text-muted">
        {game.thumb ? <img src={game.thumb} alt="" loading="lazy" className="size-full object-cover" onError={(e) => e.currentTarget.remove()} /> : game.title[0]}
      </div>
      <div className="truncate px-3 py-2 text-sm">{game.title}</div>
    </button>
  );
}

export function GamesPage() {
  const [data, setData] = useState<{ sources: Record<string, GameSourceInfo>; games: SiliconGame[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [favs] = useLocalStorage<string[]>(KEYS.favs, []);

  // Live from the backend every time. Slow sources may still be on their first fetch after a server start.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, stopped = false;
    const load = async () => {
      try {
        const r = await fetch("/api/games");
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as NonNullable<typeof data>;
        if (stopped) return;
        setData(d);
        if (Object.values(d.sources).some((s) => s.loading)) timer = setTimeout(load, 4000);
      } catch { if (!stopped) setFailed(true); }
    };
    void load();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  // One source at a time, biggest first.
  const available = useMemo(() => Object.entries(data?.sources ?? {}).filter(([, s]) => s.count).sort((a, b) => b[1].count - a[1].count), [data]);
  const current = source && data?.sources[source]?.count ? source : available[0]?.[0] ?? "";
  const needle = q.trim().toLowerCase();
  const games = useMemo(() => (data?.games ?? []).filter((g) => g.source === current && (!needle || g.title.toLowerCase().includes(needle))), [data, current, needle]);
  const favourites = useMemo(() => { const set = new Set(favs); return (data?.games ?? []).filter((g) => set.has(g.id)); }, [data, favs]);

  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg px-6 py-3">
        <h1 className="text-2xl">Games</h1>
        <input aria-label="Search games" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE_SIZE); }} placeholder="Search games" className="h-10 min-w-40 flex-1 rounded-full bg-field px-4 text-sm outline-none placeholder:text-muted" />
        <select aria-label="Source" value={current} onChange={(e) => { setSource(e.target.value); setLimit(PAGE_SIZE); }} className="h-10 rounded-lg bg-field px-3 text-sm">
          {available.map(([k, s]) => <option key={k} value={k}>{s.label} ({s.count})</option>)}
        </select>
      </header>
      <div className="flex flex-col gap-6 p-6">
        {failed && <p className="text-muted">The game server didn't answer. Reload to try again.</p>}
        {!data && !failed && <p className="text-muted">Loading games…</p>}
        {favourites.length > 0 && !needle && (
          <section aria-label="Favorites"><h2 className="mb-2 text-sm text-muted">Favorites</h2><div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">{favourites.map((g) => <GameTile key={g.id} game={g} />)}</div></section>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">{games.slice(0, limit).map((g) => <GameTile key={g.id} game={g} />)}</div>
        {data && !games.length && <p className="text-muted">No games match.</p>}
        {games.length > limit && <button onClick={() => setLimit(limit + PAGE_SIZE)} className="self-center rounded-full bg-tile px-5 py-2 text-sm hover:bg-field-hover">Show more ({games.length - limit})</button>}
      </div>
    </main>
  );
}
