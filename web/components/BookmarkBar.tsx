"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { MenuState } from "./Menu";
import { useBookmarks } from "@/hooks/useBookmarks";
import { sameUrl, type Bookmark } from "@/lib/bookmarks";
import { hostOf } from "@/lib/protocol";

interface Props {
  show: boolean;
  onOpen(b: Bookmark, newTab: boolean): void;
  onEdit(b: Bookmark): void;
  showMenu(menu: MenuState): void;
}

export function BookmarkBar({ show, onOpen, onEdit, showMenu }: Props) {
  const [list, setList] = useBookmarks();
  const bar = useRef<HTMLElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const visible = show && list.length > 0;

  // Bookmarks that don't fit go in the » menu at the end.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !visible) return;
    const measure = () => {
      const chips = [...el.querySelectorAll<HTMLElement>(".bm:not(.bm-more)")];
      chips.forEach((c) => { c.style.display = ""; });
      const room = el.clientWidth - 16 - 40; // padding and the » button
      let used = 0, fit = chips.length;
      for (let i = 0; i < chips.length; i++) { used += chips[i].offsetWidth + 2; if (used > room) { fit = i; break; } }
      chips.slice(fit).forEach((c) => { c.style.display = "none"; });
      setHiddenCount(chips.length - fit);
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [list, visible]);

  const open = (b: Bookmark, e: MouseEvent) => onOpen(b, e.metaKey || e.ctrlKey || e.button === 1);
  const context = (b: Bookmark, e: MouseEvent) => {
    e.preventDefault();
    showMenu({ at: { x: e.clientX, y: e.clientY }, items: [
      { icon: "open_in_new", label: "Open in new tab", run: () => onOpen(b, true) },
      { icon: "edit", label: "Edit bookmark", run: () => onEdit(b) },
      { icon: "delete", label: "Delete", run: () => setList((l) => l.filter((x) => !sameUrl(x.url, b.url))) },
    ] });
  };

  return (
    <nav ref={bar} id="bookmarkbar" aria-label="Bookmarks" hidden={!visible}>
      {list.map((b) => (
        <button key={b.url} className="bm" title={`${b.title}\n${b.url}`} onClick={(e) => open(b, e)} onAuxClick={(e) => { if (e.button === 1) open(b, e); }} onContextMenu={(e) => context(b, e)}>
          <span className="bm-ico">{b.icon ? <img alt="" src={b.icon} /> : <span className="ms">public</span>}</span>
          <span className="bm-label">{b.title || hostOf(b.url)}</span>
        </button>
      ))}
      {hiddenCount > 0 && (
        <button className="bm bm-more" title="More bookmarks" data-opens-menu onClick={(e) => showMenu({
          owner: "more", at: e.currentTarget.getBoundingClientRect(),
          items: list.slice(list.length - hiddenCount).map((b) => ({ icon: "public", img: b.icon, label: b.title || hostOf(b.url), run: () => onOpen(b, false) })),
        })}><span className="ms">keyboard_double_arrow_right</span></button>
      )}
    </nav>
  );
}
