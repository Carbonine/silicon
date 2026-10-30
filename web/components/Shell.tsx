"use client";

import { useEffect, useState } from "react";
import { BrowserShell } from "./BrowserShell";
import { TabProvider } from "@/context/TabContext";
import { NEW_TAB_URL } from "@/context/TabContext";
import { normalizeUrl } from "@/lib/protocol";

// Mounted in the browser only: the shell depends on window, and frames must not be rendered on the server.
export function Shell() {
  const [start, setStart] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // Never nest the browser inside itself. The one exception is the cover window, which loads ?cover=1.
    if (self !== top && q.get("cover") !== "1") return;
    setStart(normalizeUrl(q.get("url") ?? "") ?? NEW_TAB_URL);
  }, []);
  if (!start) return null;
  return <TabProvider initialUrl={start}><BrowserShell /></TabProvider>;
}
