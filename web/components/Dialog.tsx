"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A native modal dialog. A click on the backdrop or Esc closes it. */
export function Dialog({ open, onClose, id, className, children }: { open: boolean; onClose(): void; id?: string; className?: string; children: ReactNode }) {
  const el = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = el.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={el} id={id} className={className} onClose={onClose} onClick={(e) => { if (e.target === el.current) onClose(); }}>{open && children}</dialog>;
}
