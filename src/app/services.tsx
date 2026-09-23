import * as React from "react";
import { createServices, type Services } from "@/core";
import { tauriDb, tauriFs } from "@/platform/tauri";

const Ctx = React.createContext<Services | null>(null);

let singleton: Services | null = null;
/** Services are stateless wrappers around the open workspace database, so one instance suffices. */
export function getServices(): Services {
  if (!singleton) singleton = createServices({ db: tauriDb, fs: tauriFs });
  return singleton;
}

export function ServicesProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={getServices()}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = React.useContext(Ctx);
  if (!s) throw new Error("useServices outside ServicesProvider");
  return s;
}
