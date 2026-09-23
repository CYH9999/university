import type { Repos, RepoContext } from "../repo";
import type { FileSystemPort } from "../ports";

export interface ServiceContext extends RepoContext {
  repos: Repos;
  fs: FileSystemPort;
}

export function today(ctx: ServiceContext): string {
  const d = ctx.clock.now();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nowIso(ctx: ServiceContext): string {
  return ctx.clock.now().toISOString();
}
