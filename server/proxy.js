// Proxy module: everything engine-specific lives here (server side) and in
// public/js/proxy-client.js + public/sw.js (browser side).
// Stack (same as InvisiProxy LTS): Scramjet 2 + scramjet-controller in the page, a Wisp server here,
// and Epoxy / libcurl transports in the browser.
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const nm = join(dirname(fileURLToPath(import.meta.url)), "../node_modules");
const mod = (name, sub = "dist") => express.static(join(nm, name, sub), { index: false });

export function mountProxy(app, server, { prefix = "/proxy/", wispPath = "/wisp/" } = {}) {
  // Wisp (WebSocket) server, same process. Loopback/private IPs stay blocked by wisp-js defaults, so the
  // proxy can't be used to reach services on this machine or your LAN.
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith(wispPath)) wisp.routeRequest(req, socket, head);
    else socket.destroy();
  });

  // Browser-side bundles: Scramjet core, the controller, plugins (all under /scram/), and the transports.
  app.use("/scram/", mod("@mercuryworkshop/scramjet"));
  app.use("/scram/", mod("@mercuryworkshop/scramjet-controller"));
  app.use("/scram/", mod("@mercuryworkshop/scramjet-utils"));
  app.use("/epoxy/", mod("@mercuryworkshop/epoxy-transport"));
  app.use("/libcurl/", mod("@mercuryworkshop/libcurl-transport"));

  // Tells the frontend how to configure the engine.
  app.get("/proxy-config.json", (req, res) => {
    res.json({ engine: "scramjet", prefix, wispPath });
  });

  // Requests here only reach Express when the service worker didn't handle them.
  app.use(prefix, (req, res) => {
    // A frame that reaches this route means the worker didn't take the request. Never answer with the
    // full UI there, or the browser ends up nested inside itself.
    if (["iframe", "frame"].includes(req.get("sec-fetch-dest"))) {
      return res.status(502).type("html").send("<!doctype html><meta charset=utf-8><body style=\"font:14px system-ui;padding:2rem\">Couldn't load this page through the proxy. Try reloading the tab.");
    }
    // Pasted /proxy/https://site links open the site in the UI.
    let rest = req.originalUrl.slice(prefix.length);
    try { rest = decodeURIComponent(rest); } catch {}
    res.redirect(/^https?:\/\//i.test(rest) ? `/?url=${encodeURIComponent(rest)}` : "/");
  });
}
