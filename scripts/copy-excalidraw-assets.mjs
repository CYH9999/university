// Copies Excalidraw's font assets into /public so the whiteboard works fully offline
// (Excalidraw otherwise fetches fonts from a public CDN).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "fonts");
const dest = join(root, "public", "fonts");

if (!existsSync(src)) {
  console.warn("[assets] Excalidraw fonts not found, skipping:", src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[assets] Excalidraw fonts copied to public/fonts");
