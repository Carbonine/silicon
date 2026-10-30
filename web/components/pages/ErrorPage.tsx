"use client";

import { useEffect, useState } from "react";
import { hostOf } from "@/lib/protocol";
import { goTo } from "@/lib/shell";

export function ErrorPage() {
  const [info, setInfo] = useState({ url: "", detail: "" });
  useEffect(() => { const q = new URLSearchParams(location.search); setInfo({ url: q.get("u") ?? "", detail: q.get("d") ?? "" }); }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 bg-bg p-6 text-text">
      <span className="ms text-5xl! text-icon">cloud_off</span>
      <h1 className="text-2xl">Can't reach {info.url ? hostOf(info.url) : "this site"}</h1>
      <p className="text-muted">The site may be down, mistyped, or blocking this server.</p>
      <div className="flex gap-2">
        <button onClick={() => info.url && goTo(info.url)} className="rounded-full bg-accent px-5 py-2 text-sm text-on-accent">Reload</button>
        <button onClick={() => goTo("silicon://newtab")} className="rounded-full bg-tile px-5 py-2 text-sm">Home</button>
      </div>
      {info.detail && <details className="text-sm text-muted"><summary>Technical details</summary><pre className="whitespace-pre-wrap">{info.detail}</pre></details>}
    </main>
  );
}
