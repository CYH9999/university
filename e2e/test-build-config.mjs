// Writes the Tauri config overlay for the Windows end-to-end test binary: the app's WebView2 is
// started with remote debugging on a fixed local port so msedgedriver can attach to it.
// Used only by the CI test build (see .github/workflows/windows.yml), never for the installers.
// Usage: node e2e/test-build-config.mjs <output.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: node e2e/test-build-config.mjs <output.json>");
const conf = JSON.parse(readFileSync(join(import.meta.dirname, "../src-tauri/tauri.conf.json"), "utf8"));
// wry's default WebView2 arguments (they are replaced when additionalBrowserArgs is set), plus the port.
const args = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222";
const windows = conf.app.windows.map((w) => ({ ...w, additionalBrowserArgs: args }));
writeFileSync(resolve(out), JSON.stringify({ app: { windows } }, null, 2));
console.log(`wrote ${resolve(out)}`);
