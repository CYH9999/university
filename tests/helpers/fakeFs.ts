/** In-memory FileSystemPort for service tests. */
import type { FileSystemPort, DirEntry, ImportedFile, FileStat } from "../../src/core/ports";

export function createFakeFs(external: Record<string, string> = {}): FileSystemPort & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>(["Subjects", "Projects", "Attachments", "Trash", "Research Library", "Cybersecurity Lab", "Whiteboards", "Exports", "Backups"]);
  const hash = (s: string) => `h${[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)}`;
  const parent = (p: string) => p.split("/").slice(0, -1).join("/");
  const ensure = (rel: string) => {
    const parts = rel.split("/");
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    return rel;
  };
  const unique = (dir: string, name: string) => {
    let n = name;
    let i = 1;
    const dot = name.lastIndexOf(".");
    while (files.has(`${dir}/${n}`) || dirs.has(`${dir}/${n}`)) n = dot > 0 ? `${name.slice(0, dot)} (${i++})${name.slice(dot)}` : `${name} (${i++})`;
    return `${dir}/${n}`;
  };
  const moveTree = (from: string, to: string) => {
    for (const [k, v] of [...files]) if (k === from || k.startsWith(`${from}/`)) { files.delete(k); files.set(to + k.slice(from.length), v); }
    for (const d of [...dirs]) if (d === from || d.startsWith(`${from}/`)) { dirs.delete(d); dirs.add(to + d.slice(from.length)); }
  };
  return {
    files,
    dirs,
    async importFiles(sources, destRel): Promise<ImportedFile[]> {
      ensure(destRel);
      return sources.map((s) => {
        const name = s.split("/").pop()!;
        if (!(s in external)) return { source: s, name, relPath: null, size: 0, sha256: null, ext: "", error: "missing", errorCode: "io.not_found" };
        const rel = unique(destRel, name);
        files.set(rel, external[s]);
        return { source: s, name: rel.split("/").pop()!, relPath: rel, size: external[s].length, sha256: hash(external[s]), ext: name.split(".").pop() ?? "", error: null, errorCode: null };
      });
    },
    async ensureDir(rel) { return ensure(rel); },
    async createDir(parentRel, name) { return ensure(`${parentRel}/${name}`); },
    async listDir(rel): Promise<DirEntry[]> {
      const out: DirEntry[] = [];
      for (const d of dirs) if (parent(d) === rel && d !== rel) out.push({ name: d.split("/").pop()!, relPath: d, isDir: true, size: 0, modified: 0, ext: "" });
      for (const [k, v] of files) if (parent(k) === rel) out.push({ name: k.split("/").pop()!, relPath: k, isDir: false, size: v.length, modified: 0, ext: k.split(".").pop() ?? "" });
      return out;
    },
    async rename(rel, newName) { const to = `${parent(rel)}/${newName}`; moveTree(rel, to); return to; },
    async move(rel, destDirRel) { const to = unique(destDirRel, rel.split("/").pop()!); moveTree(rel, to); return to; },
    async copy(rel, destDirRel) { const to = unique(destDirRel, rel.split("/").pop()!); files.set(to, files.get(rel) ?? ""); return to; },
    async trash(rel) { const to = `Trash/20260101-000000__${rel.split("/").pop()}`; moveTree(rel, to); return to; },
    async restore(trashRel, originalRel) { ensure(parent(originalRel)); moveTree(trashRel, originalRel); return originalRel; },
    async deletePermanent(trashRel) { for (const k of [...files.keys()]) if (k === trashRel || k.startsWith(`${trashRel}/`)) files.delete(k); },
    async emptyTrash() { let n = 0; for (const k of [...files.keys()]) if (k.startsWith("Trash/")) { files.delete(k); n++; } return n; },
    async statMany(rels): Promise<FileStat[]> { return rels.map((r) => ({ relPath: r, exists: files.has(r) || dirs.has(r), isDir: dirs.has(r), size: files.get(r)?.length ?? 0, modified: 0 })); },
    async writeText(rel, content) { ensure(parent(rel)); files.set(rel, content); return rel; },
    async readText(rel) { const v = files.get(rel); if (v === undefined) throw new Error("not found"); return v; },
    async hash(rel) { return hash(files.get(rel) ?? ""); },
    async hashExternal(path) { if (!(path in external)) throw new Error("missing"); return hash(external[path]); },
  };
}
