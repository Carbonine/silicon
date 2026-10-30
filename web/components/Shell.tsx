"use client";

import { useEffect, useState } from "react";
import { BrowserShell } from "./BrowserShell";
import { NEW_TAB_URL, TabProvider } from "@/context/TabContext";
import { normalizeUrl } from "@/lib/protocol";

// Mounted in the browser only: the shell depends on window, and frames must not be rendered on the server.
export function Shell() {
  const [start, setStart] = useState<{ url: string; cover: boolean } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // Never nest the browser inside itself. The one exception is the cover window, which loads ?cover=1.
    if (self !== top && q.get("cover") !== "1") return;
    const cover = q.get("cover") === "1";
    setStart({ url: normalizeUrl(q.get("url") ?? "") ?? NEW_TAB_URL, cover });
    if (q.get("url")) history.replaceState(null, "", cover ? "/?cover=1" : "/");
  }, []);
  if (!start) return null;
  return <><link rel="stylesheet" href="/css/style.css" /><TabProvider initialUrl={start.url}><BrowserShell isCover={start.cover} /></TabProvider></>;
}
