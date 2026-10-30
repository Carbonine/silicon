// Key events don't cross iframe boundaries, so one listener goes on every window we can reach. Deduped by
// document: an iframe's window object survives navigation, but each page gets a new document.
type KeyHandler = (e: KeyboardEvent) => void;
const handlers = new Set<KeyHandler>();
const keyed = new WeakSet<Document>();
let capturing = false; // Settings is recording a key: it must not also fire
const dispatch = (e: Event) => { if (!capturing) handlers.forEach((h) => h(e as KeyboardEvent)); };
export const setKeyCapture = (on: boolean): void => { capturing = on; };

export function onShellKey(h: KeyHandler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}

export function attachWindow(win: Window | null | undefined): void {
  try {
    const doc = win?.document;
    if (win && doc && !keyed.has(doc)) { keyed.add(doc); win.addEventListener("keydown", dispatch, true); }
  } catch {}
}
