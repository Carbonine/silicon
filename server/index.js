import "dotenv/config";
import express from "express";
import compression from "compression";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mountProxy } from "./proxy.js";
import { mountGames } from "./games.js";
import { mountIcons } from "./icons.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PROXY_PREFIX = process.env.PROXY_PREFIX || "/proxy/";
const WISP_PATH = process.env.WISP_PATH || "/wisp/";

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");
app.use(compression()); // the game catalog is large JSON
// Let the service worker control the whole origin (it only touches the proxy prefix).
app.use((req, res, next) => {
  res.set("Service-Worker-Allowed", "/");
  next();
});

// Must be mounted before the static/catch-all handlers.
mountGames(app);
mountIcons(app);
mountProxy(app, server, { prefix: PROXY_PREFIX, wispPath: WISP_PATH });

app.use("/vendor/msym", express.static(join(__dirname, "../node_modules/material-symbols")));
app.use("/vendor/inter", express.static(join(__dirname, "../node_modules/@fontsource-variable/inter/files")));
// silicon://NAME pages are served as /silicon/NAME (public/silicon/NAME.html)
app.use("/silicon", express.static(join(__dirname, "../public/silicon"), { extensions: ["html"], index: false }));
app.use(express.static(join(__dirname, "../public")));

server.listen(PORT, HOST, () => {
  console.log(`Silicon running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  if (HOST === "0.0.0.0") console.log("Listening on all interfaces: anyone on your LAN can reach this proxy.");
});
