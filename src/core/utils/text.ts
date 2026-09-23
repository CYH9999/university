/** Text helpers shared by search, exports and previews. */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;

const CHAR_MAP: Record<string, string> = {
  "أ": "ا",
  "إ": "ا",
  "آ": "ا",
  "ٱ": "ا",
  "ى": "ي",
  "ئ": "ي",
  "ؤ": "و",
  "ة": "ه",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

/**
 * Normalizes text for search: lower-case, removes Arabic diacritics and tatweel,
 * unifies alef/yaa/taa-marbuta variants and Arabic-Indic digits. Also returns a map
 * from each normalized character to its index in the original string, so matches can
 * be highlighted in the original text.
 */
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ARABIC_DIACRITICS.test(ch)) continue;
    const mapped = CHAR_MAP[ch] ?? ch.toLowerCase();
    for (const c of mapped) {
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}

export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return "";
  return normalizeWithMap(input).text.replace(/\s+/g, " ").trim();
}

/** Returns a short excerpt of `text` around the first occurrence of any term. */
export function makeSnippet(text: string, terms: string[], radius = 70): { before: string; match: string; after: string } | null {
  if (!text) return null;
  const { text: norm, map } = normalizeWithMap(text);
  let best = -1;
  let len = 0;
  for (const term of terms) {
    const t = normalizeForSearch(term);
    if (!t) continue;
    const idx = norm.indexOf(t);
    if (idx >= 0 && (best < 0 || idx < best)) {
      best = idx;
      len = t.length;
    }
  }
  if (best < 0) {
    const s = text.slice(0, radius * 2).replace(/\s+/g, " ");
    return { before: s, match: "", after: text.length > radius * 2 ? "…" : "" };
  }
  const start = map[best];
  const end = (map[best + len - 1] ?? start) + 1;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return {
    before: (from > 0 ? "…" : "") + text.slice(from, start).replace(/\s+/g, " "),
    match: text.slice(start, end),
    after: text.slice(end, to).replace(/\s+/g, " ") + (to < text.length ? "…" : ""),
  };
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Makes a string safe to use as a single file/folder name (mirrors the Rust sanitizer). */
export function safeFileName(name: string, fallback = "untitled"): string {
  let s = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/^\.+/, "");
  if (!s) s = fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `_${s}`;
  return s.slice(0, 120);
}

export function formatBytes(bytes: number, locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const lines = [cols.map(csvEscape).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  // BOM so Excel opens UTF-8 (Arabic) correctly.
  return "﻿" + lines.join("\r\n");
}
