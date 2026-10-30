"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// Searches the open tab's text and marks matches with CSS.highlights, so the page itself is not changed. Works on
// proxied and silicon:// pages, because both live in the tab's frame. A match split across formatting tags isn't found.
const MAX = 5000;
const STYLE = "::highlight(silicon-find){background-color:#ffe066;color:#000}::highlight(silicon-find-current){background-color:#ff9632;color:#000}";

type FindWindow = Window & typeof globalThis & { Highlight?: new (...r: Range[]) => unknown; CSS: { highlights?: Map<string, unknown> } };
export interface FindHandle { open(): void; close(): void }

export const FindBar = forwardRef<FindHandle, { frame: () => HTMLIFrameElement | undefined; tabKey: string | undefined; loading: boolean }>(function FindBar({ frame, tabKey, loading }, ref) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("");
  const [none, setNone] = useState(false);
  const [top, setTop] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const found = useRef<{ ranges: Range[]; index: number; win: FindWindow | null }>({ ranges: [], index: -1, win: null });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clear = useCallback(() => {
    const { win } = found.current;
    try { win?.CSS.highlights?.delete("silicon-find"); win?.CSS.highlights?.delete("silicon-find-current"); } catch {}
    found.current = { ranges: [], index: -1, win: null };
  }, []);

  const show = useCallback((i: number) => {
    const f = found.current, n = f.ranges.length;
    if (!n || !f.win) return;
    f.index = (i + n) % n;
    const r = f.ranges[f.index];
    try {
      f.win.CSS.highlights?.set("silicon-find-current", new f.win.Highlight!(r));
      r.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {}
    setCount(`${f.index + 1}/${n}${n >= MAX ? "+" : ""}`);
  }, []);

  const run = useCallback(() => {
    clear();
    setNone(false);
    setCount("");
    const q = input.current?.value ?? "";
    let doc: Document | null = null;
    try { doc = frame()?.contentDocument ?? null; } catch {}
    const win = doc?.defaultView as FindWindow | null | undefined;
    if (!q || !doc || !win) return;
    if (!win.CSS?.highlights || !win.Highlight) { setCount("Not supported"); return; }
    if (!doc.getElementById("silicon-find-style")) {
      const st = doc.createElement("style");
      st.id = "silicon-find-style";
      st.textContent = STYLE;
      (doc.head ?? doc.documentElement).append(st);
    }
    const needle = q.toLowerCase(), ranges: Range[] = [];
    const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const el = n.parentElement;
        if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(el.tagName) || !n.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        try { if (!el.checkVisibility({ checkVisibilityCSS: true })) return NodeFilter.FILTER_REJECT; } catch {} // hidden text isn't searched
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n && ranges.length < MAX; n = walker.nextNode()) {
      const text = n.nodeValue!.toLowerCase();
      for (let i = text.indexOf(needle); i !== -1 && ranges.length < MAX; i = text.indexOf(needle, i + needle.length)) {
        const r = doc.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + needle.length);
        ranges.push(r);
      }
    }
    found.current = { ranges, index: -1, win };
    if (!ranges.length) { setNone(true); setCount("0/0"); return; }
    win.CSS.highlights.set("silicon-find", new win.Highlight(...ranges));
    show(0);
  }, [clear, frame, show]);

  const close = useCallback(() => {
    clear();
    setOpen(false);
    setCount("");
    try { frame()?.contentWindow?.focus(); } catch {}
  }, [clear, frame]);

  useImperativeHandle(ref, () => ({
    open() {
      let sel = "";
      try { sel = frame()?.contentWindow?.getSelection()?.toString().trim() ?? ""; } catch {}
      setTop(frame()?.parentElement?.getBoundingClientRect().top ?? 0); // just under the toolbar and bookmarks bar
      setOpen(true);
      if (input.current && sel && sel.length < 100 && !sel.includes("\n")) input.current.value = sel; // start from what is selected
      setTimeout(() => { input.current?.focus(); input.current?.select(); run(); }, 0);
    },
    close,
  }), [close, frame, run]);

  // The bar stays open and searches a new tab or a newly loaded page.
  useEffect(() => { if (open && !loading) run(); }, [loading, open, run, tabKey]);

  return (
    <div ref={bar} id="findbar" role="search" hidden={!open} className={none ? "none" : undefined} style={{ top }}>
      <input
        ref={input} id="find-input" type="text" placeholder="Find in page" aria-label="Find in page" spellCheck={false} autoComplete="off"
        onInput={() => { clearTimeout(timer.current); timer.current = setTimeout(run, 120); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); show(found.current.index + (e.shiftKey ? -1 : 1)); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }}
      />
      <span id="find-count" aria-live="polite">{count}</span>
      <button id="find-prev" className="icon-btn" aria-label="Previous match" title="Previous match (Shift+Enter)" onClick={() => show(found.current.index - 1)}><span className="ms">keyboard_arrow_up</span></button>
      <button id="find-next" className="icon-btn" aria-label="Next match" title="Next match (Enter)" onClick={() => show(found.current.index + 1)}><span className="ms">keyboard_arrow_down</span></button>
      <button id="find-close" className="icon-btn" aria-label="Close find" title="Close (Esc)" onClick={close}><span className="ms">close</span></button>
    </div>
  );
});
