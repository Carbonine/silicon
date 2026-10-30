// Copies the Scramjet service worker byte for byte, so ../public/sw.js stays the only version of it.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, "../../public/sw.js"), join(here, "../public/sw.js"));
copyFileSync(join(here, "../../public/favicon.svg"), join(here, "../public/favicon.svg"));
