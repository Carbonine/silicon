"use client";

import { useEffect, useState } from "react";
import { usePageClass } from "@/hooks/usePageClass";
import { useSettings } from "@/hooks/useSettings";
import { hostOf } from "@/lib/protocol";
import { goTo, shell } from "@/lib/shell";

// A plain-language guess from the technical message. These messages vary, so this is only a hint.
const guess = (d: string) => /timed? ?out|timeout|took too long/i.test(d) ? "The site took too long to answer."
  : /dns|resolve|lookup|not known|no such host|nxdomain/i.test(d) ? "The server couldn't find that address."
  : /refused/i.test(d) ? "The site refused the connection."
  : /certificate/i.test(d) ? "The site's security certificate wasn't accepted."
  : /did not respond|service worker/i.test(d) ? "The proxy didn't respond."
  : /tls|ssl|handshake|closed|incomplete|eof|reset|broken pipe/i.test(d) ? "Couldn't connect to the site. It may not exist, or it may be refusing the connection."
  : "Something went wrong while loading the page.";
const nameOf = (t: string) => (t === "epoxy" ? "Epoxy" : "libcurl");

export function ErrorPage() {
  usePageClass("err-page");
  const { settings, update } = useSettings();
  const [info, setInfo] = useState({ url: "", detail: "" });
  const [switching, setSwitching] = useState(false);
  useEffect(() => { const q = new URLSearchParams(location.search); setInfo({ url: q.get("u") ?? "", detail: q.get("d") ?? "" }); }, []);
  const title = info.url ? `Can't reach ${hostOf(info.url)}` : "Can't reach this site";
  useEffect(() => { document.title = title; shell()?.retitle(window); }, [title]);
  const other = settings.transport === "epoxy" ? "libcurl" : "epoxy";
  const tryOther = async () => {
    setSwitching(true);
    update({ transport: other });
    try { await shell()?.applyTransport(); } catch {}
    if (info.url) goTo(info.url);
  };

  return (
    <main className="err">
      <span className="ms err-ico">cloud_off</span>
      <h1>{title}</h1>
      <p className="err-cause">{guess(info.detail)}</p>
      <ul className="err-list">
        <li>The address may be mistyped, or the site may be down.</li>
        <li>The site may block proxies or this server's connection.</li>
        <li>This network may be blocking the connection to the proxy.</li>
      </ul>
      <div className="err-actions">
        {info.url && <button className="s-btn primary" onClick={() => goTo(info.url)}>Reload</button>}
        {info.url && <button className="s-btn" disabled={switching} title={`Switch the proxy transport from ${nameOf(settings.transport)} to ${nameOf(other)} and reload`} onClick={tryOther}>Try {nameOf(other)}</button>}
        <button className="s-btn" onClick={() => goTo("silicon://newtab")}>Home</button>
      </div>
      <details className="err-details"><summary>Technical details</summary><pre>{(info.url ? `${info.url}\n\n` : "") + (info.detail || "No details were given.")}</pre></details>
    </main>
  );
}
