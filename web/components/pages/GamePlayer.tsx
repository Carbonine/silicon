"use client";

import { useEffect, useRef, useState } from "react";
import { KEYS, loadSettings, readJson, writeJson } from "@/lib/storage";
import { goTo, shell } from "@/lib/shell";
import type { ScramjetFrame, SiliconGame } from "@/lib/types";

const barButton = "grid size-9 place-items-center rounded-full text-icon hover:bg-hover";

export function GamePlayer({ id }: { id: string }) {
  const [game, setGame] = useState<SiliconGame | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [problem, setProblem] = useState("");
  const [viaProxy, setViaProxy] = useState<boolean | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const proxied = useRef<ScramjetFrame | null>(null);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const r = await fetch(`/api/games/${encodeURIComponent(id)}`);
        if (r.status === 404) { if (!stopped) setProblem("That game isn't in the library."); return; }
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { game: SiliconGame; source?: { label: string } };
        if (stopped) return;
        const g = d.game;
        setGame(g);
        setSourceLabel(d.source?.label ?? "");
        setIsFav(readJson<string[]>(KEYS.favs, []).includes(g.id));
        document.title = g.title;
        shell()?.retitle(window);
        writeJson(KEYS.recent, [{ id: g.id, t: Date.now() }, ...readJson<{ id: string }[]>(KEYS.recent, []).filter((x) => x.id !== g.id)].slice(0, 12));
        // Remote games use the proxy when "Proxy games" is on. Emulator games default to direct, since their
        // core runs in a worker that fails through the proxy. The shield switches either way and is remembered.
        const src = g.path || g.url || "";
        const remote = !g.path && /^https?:/i.test(src);
        const saved = readJson<boolean | null>(`games:proxy:${g.id}`, null);
        setViaProxy(remote && (saved ?? (loadSettings().proxyGames && !(g.tags ?? []).includes("emulator"))));
      } catch { if (!stopped) setProblem("The game server didn't answer. Go back and try again."); }
    })();
    return () => { stopped = true; };
  }, [id]);

  const src = game ? game.path || game.url || "" : "";
  const remote = !!game && !game.path && /^https?:/i.test(src);
  const external = game?.mode === "external";

  useEffect(() => {
    const el = iframe.current;
    if (!game || external || viaProxy === null || !el) return;
    let stopped = false;
    setLoading(true);
    (async () => {
      el.src = "about:blank";
      if (!viaProxy) { el.src = game.kind === "html-text" ? `/api/games/play/${encodeURIComponent(game.id)}` : src; return; }
      try {
        const bridge = shell();
        if (!bridge) throw new Error("Open this game from Silicon.");
        proxied.current ??= await bridge.createGameFrame(el);
        if (!stopped) proxied.current.go(src);
      } catch (err) { setProblem(`Couldn't start the proxy: ${err instanceof Error ? err.message : err}`); }
    })();
    return () => { stopped = true; };
  }, [external, game, reloads, src, viaProxy]);

  const toggleFav = () => {
    if (!game) return;
    const favs = new Set(readJson<string[]>(KEYS.favs, []));
    if (favs.has(game.id)) favs.delete(game.id); else favs.add(game.id);
    writeJson(KEYS.favs, [...favs]);
    setIsFav(favs.has(game.id));
  };
  const flip = () => { if (!game) return; writeJson(`games:proxy:${game.id}`, !viaProxy); setViaProxy(!viaProxy); };

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <button onClick={() => goTo("silicon://games")} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm hover:bg-hover"><span className="ms">arrow_back</span>Games</button>
        <div className="min-w-0 flex-1 truncate text-sm">{game?.title}{sourceLabel && <span className="text-muted"> · {sourceLabel}</span>}</div>
        {game && !external && <>
          {remote && <button aria-label="Switch between proxy and direct" title={viaProxy ? "Loaded through the proxy (click to load directly)" : "Loaded directly (click to use the proxy)"} onClick={flip} className={`${barButton} ${viaProxy ? "text-accent" : ""}`}><span className="ms">vpn_lock</span></button>}
          <button aria-label="Favorite" onClick={toggleFav} className={`${barButton} ${isFav ? "text-accent" : ""}`}><span className={`ms ${isFav ? "fill" : ""}`}>star</span></button>
          <button aria-label="Refresh game" onClick={() => setReloads(reloads + 1)} className={barButton}><span className="ms">refresh</span></button>
          <button aria-label="Fullscreen" onClick={() => iframe.current?.requestFullscreen?.()} className={barButton}><span className="ms">fullscreen</span></button>
        </>}
      </header>
      <main className="relative min-h-0 flex-1">
        {problem ? <p className="p-8 text-center text-muted">{problem}</p>
          : external ? <div className="p-8 text-center"><p className="mb-4 text-muted">This one runs on its own site and can't be shown inside Silicon.</p><button onClick={() => window.open(src, "_blank", "noopener")} className="rounded-full bg-accent px-5 py-2 text-sm text-on-accent">Open {game?.title}</button></div>
          : <>
            <iframe ref={iframe} title={game?.title ?? "Game"} allow="fullscreen; gamepad; autoplay; clipboard-write; accelerometer; gyroscope" onLoad={(e) => { if (e.currentTarget.contentDocument?.documentURI !== "about:blank") setLoading(false); }} className="size-full border-0" />
            {loading && <p className="absolute inset-0 grid place-items-center bg-bg text-muted">Loading{game ? ` ${game.title}` : ""}…</p>}
          </>}
      </main>
    </div>
  );
}
