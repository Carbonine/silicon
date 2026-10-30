"use client";

import { useEffect } from "react";

/** The class pages.css expects on <body> for each silicon:// page. */
export function usePageClass(name: string): void {
  useEffect(() => {
    document.body.className = name;
    return () => { document.body.className = ""; };
  }, [name]);
}
