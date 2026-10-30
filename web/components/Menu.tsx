"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuEntry { icon?: string; img?: string; label: string; hint?: string; run(): void }
export type MenuItem = MenuEntry | "-";
export interface MenuState {
  items: MenuItem[];
  /** A point, or the rectangle of the button it opens under. */
  at: { x: number; y: number } | DOMRect;
  /** Set for menus with a toggle button: pressing that button again closes the menu. */
  owner?: string;
}

export function Menu({ menu, onClose }: { menu: MenuState; onClose(): void }) {
  const el = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const box = el.current!, w = box.offsetWidth, h = box.offsetHeight, at = menu.at;
    const [x, y] = "bottom" in at ? [at.right - w, at.bottom + 4] : [at.x, at.y];
    setPlace({ left: Math.max(8, Math.min(x, innerWidth - w - 8)), top: Math.max(8, Math.min(y, innerHeight - h - 8)) });
    box.querySelector("button")?.focus();
  }, [menu]);

  // Clicks inside a page never reach the shell, but they do blur this window.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!el.current?.contains(t) && !t.closest("[data-opens-menu]")) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); e.stopPropagation(); } };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    addEventListener("blur", onClose);
    addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      removeEventListener("blur", onClose);
      removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div ref={el} id="menu" className="menu" role="menu" style={place}>
      {menu.items.map((it, i) => it === "-" ? <div key={i} className="menu-sep" /> : (
        <button key={i} className="menu-item" role="menuitem" onClick={() => { onClose(); it.run(); }}>
          {it.img ? <img className="menu-img" alt="" src={it.img} /> : <span className="ms">{it.icon}</span>}
          <span className="menu-label">{it.label}</span>
          <span className="menu-hint">{it.hint}</span>
        </button>
      ))}
    </div>
  );
}
