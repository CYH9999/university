import * as React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import "./i18n";
import { App } from "./app/App";

// Excalidraw loads its fonts from this path (bundled locally for offline use).
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
