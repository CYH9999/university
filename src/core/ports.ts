/**
 * Ports: platform capabilities the core needs, implemented by the desktop shell
 * (Tauri) today and by a mobile shell later. Paths are always relative to the Workspace.
 */
export interface ImportedFile {
  source: string;
  name: string;
  relPath: string | null;
  size: number;
  sha256: string | null;
  ext: string;
  error: string | null;
  errorCode: string | null;
}

export interface DirEntry {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
  modified: number;
  ext: string;
}

export interface FileStat {
  relPath: string;
  exists: boolean;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface FileSystemPort {
  importFiles(sources: string[], destRel: string): Promise<ImportedFile[]>;
  ensureDir(rel: string): Promise<string>;
  createDir(parentRel: string, name: string): Promise<string>;
  listDir(rel: string): Promise<DirEntry[]>;
  rename(rel: string, newName: string): Promise<string>;
  move(rel: string, destDirRel: string): Promise<string>;
  copy(rel: string, destDirRel: string): Promise<string>;
  trash(rel: string): Promise<string>;
  restore(trashRel: string, originalRel: string): Promise<string>;
  deletePermanent(trashRel: string): Promise<void>;
  emptyTrash(): Promise<number>;
  statMany(rels: string[]): Promise<FileStat[]>;
  writeText(rel: string, content: string): Promise<string>;
  readText(rel: string): Promise<string>;
  hash(rel: string): Promise<string>;
  hashExternal(path: string): Promise<string>;
}
