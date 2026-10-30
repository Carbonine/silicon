"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageClass } from "@/hooks/usePageClass";
import { useSlashSearch } from "@/hooks/useSlashSearch";
import { openLink } from "@/lib/shell";
import { KEYS } from "@/lib/storage";
import type { GameSourceInfo, SiliconGame } from "@/lib/types";

const PAGE = 60;
type Sort = "az" | "za" | "recent";
interface Catalog { sources: Record<string, GameSourceInfo>; games: SiliconGame[] }

const tagsOf = (g: SiliconGame) => (g.tags?.length ? g.tags : g.category ? [g.category] : []);
const catOf = (g: SiliconGame) => g.category || tagsOf(g)[0] || "";
const nice = (t: string) => t.replace(/(^|[-\s])(\w)/g, (_, s: string, c: string) => (s === "-" ? " " : s) + c.toUpperCase()).replace(/^Rpg$/, "RPG").replace(/^Fps$/, "FPS").replace(/^Io$/, ".io");
// Eight spread-out hues, picked from a hash of the title, for games without a thumbnail.
const hue = (s: string) => ([...s].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 8) * 45 + 210;

function GameCard({ g, label, fav, onFav }: { g: SiliconGame; label: string; fav: boolean; onFav(id: string): void }) {
  const [thumb, setThumb] = useState(!!g.thumb);
  const play = (e: MouseEvent) => openLink(`silicon://play/${encodeURIComponent(g.id)}`, e);
  return (
    <div className="game">
      <button className="game-main" title={g.title} onClick={play} onAuxClick={(e) => { if (e.button === 1) play(e); }}>
        <div className="thumb" style={{ "--h": hue(g.title || g.id) } as CSSProperties}>
          {thumb && <img alt="" loading="lazy" referrerPolicy="no-referrer" src={g.thumb} onError={() => setThumb(false)} />}
          <span className="initial">{(g.title || "?")[0].toUpperCase()}</span>
          <span className="warns">{g.warnings?.map((w) => <span key={w} className={`warn${w === "wip" ? " wip" : ""}`}>{w === "wip" ? "WIP" : w === "gore" ? "Gore" : w}</span>)}</span>
        </div>
        <div className="meta"><div className="name">{g.title}</div><div className="sub"><span className="src">{label}</span><span className="cat">{catOf(g) ? nice(catOf(g)) : ""}</span></div></div>
      </button>
      <button className={`fav${fav ? " on" : ""}`} aria-label="Favorite" title="Favorite" onClick={(e) => { e.stopPropagation(); onFav(g.id); }}><span className={`ms${fav ? " fill" : ""}`}>star</span></button>
    </div>
  );
}

export function GamesPage() {
  usePageClass("games-page");
  const search = useSlashSearch();
  const [data, setData] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("All");
  const [sort, setSort] = useState<Sort>("az");
  const [shown, setShown] = useState(PAGE);
  const [savedSource, setSavedSource] = useLocalStorage<string | null>(KEYS.gamesSource, null);
  const [favs, setFavs] = useLocalStorage<string[]>(KEYS.favs, []);
  const [recent, setRecent] = useLocalStorage<{ id: string; t: number }[]>(KEYS.recent, []);
  const sentinel = useRef<HTMLDivElement>(null);

  // Live from the backend every time. Slow sources may still be on their first fetch after a server start.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, stopped = false, tries = 0;
    const load = async () => {
      try {
        const r = await fetch("/api/games");
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Catalog;
        if (stopped) return;
        setData(d);
        if (Object.values(d.sources).some((s) => s.loading) && tries++ < 8) timer = setTimeout(load, 4000);
      } catch { if (!stopped) setFailed(true); }
    };
    void load();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  const games = useMemo(() => data?.games ?? [], [data]);
  const sources = useMemo(() => data?.sources ?? {}, [data]);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  // One source at a time, biggest first. The last choice is remembered, so coming back from a game keeps your place.
  const available = useMemo(() => Object.entries(sources).filter(([, s]) => s.count).sort((a, b) => b[1].count - a[1].count).map(([k]) => k), [sources]);
  const source = savedSource && available.includes(savedSource) ? savedSource : available[0] ?? "";
  const needle = q.trim().toLowerCase();
  const labelOf = useCallback((g: SiliconGame) => sources[g.source ?? ""]?.label ?? g.source ?? "", [sources]);
  const matches = useCallback((g: SiliconGame, src: string, t: string) => {
    if (g.source !== src) return false;
    if (t !== "All" && !tagsOf(g).includes(t)) return false;
    return !needle || `${g.title} ${(g.alt ?? []).join(" ")} ${tagsOf(g).join(" ")} ${labelOf(g)}`.toLowerCase().includes(needle);
  }, [labelOf, needle]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) if (g.source === source) for (const t of tagsOf(g)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [games, source]);

  const list = useMemo(() => {
    const out = games.filter((g) => matches(g, source, tag));
    if (sort === "az") out.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za") out.sort((a, b) => b.title.localeCompare(a.title));
    else { const at = new Map(recent.map((r) => [r.id, r.t])); out.sort((a, b) => (at.get(b.id) ?? 0) - (at.get(a.id) ?? 0) || a.title.localeCompare(b.title)); }
    return out;
  }, [games, matches, recent, sort, source, tag]);

  useEffect(() => setShown(PAGE), [needle, sort, source, tag]);
  // The grid fills in as you scroll, so about 900 games stay fast.
  useEffect(() => {
    const seen = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => (n < list.length ? n + PAGE : n)); }, { rootMargin: "600px" });
    if (sentinel.current) seen.observe(sentinel.current);
    return () => seen.disconnect();
  }, [list.length, shown]);

  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFav = useCallback((id: string) => setFavs((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])), [setFavs]);
  const pickSource = (k: string) => { setSavedSource(k); setTag("All"); };
  const card = (g: SiliconGame) => <GameCard key={g.id} g={g} label={labelOf(g)} fav={favSet.has(g.id)} onFav={toggleFav} />;

  const filtering = !!needle || tag !== "All";
  // Continue playing and Favorites are yours, so they span every source. New and Popular belong to the selected one.
  const rows = filtering ? null : {
    recent: recent.map((r) => byId.get(r.id)).filter((g): g is SiliconGame => !!g),
    fav: games.filter((g) => favSet.has(g.id)),
    fresh: games.filter((g) => g.source === source && g.added && Date.now() - g.added < 14 * 864e5).sort((a, b) => b.added! - a.added!).slice(0, 20),
    top: games.filter((g) => g.top && g.source === source),
  };
  const bad = Object.values(sources).filter((s) => s.error && !s.count);
  const others = !list.length && needle && !failed ? available.filter((k) => k !== source).map((k) => [k, games.filter((g) => matches(g, k, "All")).length] as const).filter(([, n]) => n) : [];
  const emptyMsg = !data && !failed ? "Loading games…" : failed ? "Couldn't reach the game server. Try again in a moment."
    : !games.length ? "No games available right now."
    : needle ? `Nothing in ${sources[source]?.label ?? "this source"} matches your search.` : "No games match.";
  const showBad = bad.length > 0 && !failed && !filtering;

  return (
    <>
      <header className="g-header">
        <h1>Games</h1>
        <label className="g-search"><span className="ms">search</span><input ref={search} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Search games" autoComplete="off" spellCheck={false} /><kbd>/</kbd></label>
        <div className="g-tools">
          <select aria-label="Source" value={source} onChange={(e) => pickSource(e.target.value)}>{available.map((k) => <option key={k} value={k}>{sources[k].label} ({sources[k].count})</option>)}</select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="az">A–Z</option><option value="za">Z–A</option><option value="recent">Recently played</option></select>
        </div>
      </header>
      {chips.length >= 2 && (
        <nav className="g-chips" aria-label="Categories">
          {["All", ...chips].map((t) => <button key={t} className={`chip${t === tag ? " active" : ""}`} onClick={() => setTag(t)}>{t === "All" ? "All" : nice(t)}</button>)}
        </nav>
      )}
      <main className="g-main">
        {!!rows?.recent.length && <section className="g-block"><div className="g-head"><h2>Continue playing</h2><button className="s-link" onClick={() => setRecent([])}>Clear</button></div><div className="g-row">{rows.recent.map(card)}</div></section>}
        {!!rows?.fav.length && <section className="g-block"><div className="g-head"><h2>Favorites</h2></div><div className="g-row">{rows.fav.map(card)}</div></section>}
        {!!rows?.fresh.length && <section className="g-block"><div className="g-head"><h2>New</h2><span className="g-count">added recently</span></div><div className="g-row">{rows.fresh.map(card)}</div></section>}
        {!!rows?.top.length && <section className="g-block"><div className="g-head"><h2>Popular</h2></div><div className="g-row">{rows.top.map(card)}</div></section>}
        <section className="g-block">
          <div className="g-head"><h2>{filtering ? "Results" : "All games"}</h2><span className="g-count">{list.length ? `${list.length} game${list.length === 1 ? "" : "s"}` : ""}</span></div>
          <div className="g-grid">{list.slice(0, shown).map(card)}</div>
          <div ref={sentinel} className="g-sentinel" />
          {(!list.length || showBad) && (
            <div className={`g-empty${list.length ? " note" : ""}`}>
              <span className="ms">{!data && !failed ? "hourglass_top" : failed ? "cloud_off" : "sports_esports"}</span>
              <p>{showBad ? `Couldn't load ${bad.map((s) => s.label).join(", ")} right now.` : emptyMsg}</p>
              <div className="g-hint">{others.map(([k, n]) => <button key={k} className="chip" onClick={() => pickSource(k)}>Try {sources[k].label} ({n})</button>)}</div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
