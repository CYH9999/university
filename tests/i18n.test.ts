/**
 * Localization checks: every key the UI uses exists in English and Arabic, both dictionaries
 * have the same keys and placeholders, plurals follow each language's rules, missing keys
 * never render as raw keys, and no user-facing text bypasses the translation system.
 */
import { describe, it, expect, beforeAll } from "vitest";
// @ts-expect-error — plain JS build script (no type declarations)
import { audit } from "../scripts/i18n-audit.mjs";
// @ts-expect-error — plain JS build script (no type declarations)
import { collect } from "../scripts/i18n-keys.mjs";
import i18n, { applyLanguage, humanizeKey, missingKeys, dirOf } from "@/i18n";
import { EN, AR, EN_FORMS, AR_FORMS, base, baseKeys, placeholders, requiredKeys } from "./helpers/i18nKeys";

const has = (m: Map<string, string>, k: string) => m.has(k) || EN_FORMS.some((f) => m.has(`${k}_${f}`)) || AR_FORMS.some((f) => m.has(`${k}_${f}`));

describe("translation coverage", () => {
  const req = requiredKeys();

  it("expands every dynamic key pattern", () => {
    expect(req.unexpandedPatterns).toEqual([]);
  });

  it("has every used key in English", () => {
    expect([...req.keys].filter((k) => !has(EN, k)).sort()).toEqual([]);
  });

  it("has every used key in Arabic", () => {
    expect([...req.keys].filter((k) => !has(AR, k)).sort()).toEqual([]);
  });

  it("defines plural forms for every count-based message", () => {
    const missing: string[] = [];
    for (const k of req.plural) {
      for (const f of EN_FORMS) if (!EN.has(`${k}_${f}`)) missing.push(`en:${k}_${f}`);
      for (const f of AR_FORMS) if (!AR.has(`${k}_${f}`)) missing.push(`ar:${k}_${f}`);
    }
    expect(missing).toEqual([]);
  });

  it("uses the same keys in both languages", () => {
    const e = baseKeys(EN);
    const a = baseKeys(AR);
    expect([...e].filter((k) => !a.has(k)).sort()).toEqual([]);
    expect([...a].filter((k) => !e.has(k)).sort()).toEqual([]);
  });

  it("uses the same placeholders in both languages", () => {
    const group = (m: Map<string, string>) => {
      const g = new Map<string, Set<string>>();
      for (const [k, v] of m) {
        const b = base(k);
        if (!g.has(b)) g.set(b, new Set());
        placeholders(v).forEach((p) => g.get(b)!.add(p));
      }
      return g;
    };
    const ge = group(EN);
    const ga = group(AR);
    const diff: string[] = [];
    for (const [k, ph] of ge) {
      // Arabic zero/one/two forms spell the number out, so {{count}} may be absent there.
      const a = new Set([...(ga.get(k) ?? [])].filter((p) => p !== "count"));
      const e = new Set([...ph].filter((p) => p !== "count"));
      if ([...e].some((p) => !a.has(p)) || [...a].some((p) => !e.has(p))) diff.push(`${k}: en{${[...e]}} ar{${[...a]}}`);
    }
    expect(diff).toEqual([]);
  });

  it("has no empty, placeholder or key-like values", () => {
    const bad: string[] = [];
    for (const [lang, m] of [["en", EN], ["ar", AR]] as const) {
      for (const [k, v] of m) {
        if (!v.trim()) bad.push(`${lang}:${k} is empty`);
        if (/\b(TODO|TBD|FIXME|XXX)\b/.test(v)) bad.push(`${lang}:${k} has a marker`);
        if (/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(v)) bad.push(`${lang}:${k} looks like a key: ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("writes Arabic text in Arabic", () => {
    // Values that are legitimately script-neutral (symbols, product names, formats).
    const neutral = /^[\s\d\W]*$|^(UniOS|University|PDF|CSV|JSON|ZIP|HTML|Markdown|SVG|Linux|Windows|macOS|OSINT|Pwn|SOC|GPA|CTF|H1|H2|H3)$/;
    // Code samples (a shell command used as a placeholder) are the same in every language.
    const codeSamples = new Set(["commands.commandPlaceholder"]);
    const latinOnly = [...AR].filter(([k, v]) => !codeSamples.has(k) && !/[\u0600-\u06FF]/.test(v) && !neutral.test(v.replace(/\{\{[^}]+\}\}/g, "").trim()));
    expect(latinOnly.map(([k, v]) => `${k}=${v}`)).toEqual([]);
  });
});

describe("runtime behaviour", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates in English and Arabic and switches immediately", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("nav.dashboard")).toBe("Dashboard");
    await i18n.changeLanguage("ar");
    expect(i18n.t("nav.dashboard")).toBe("لوحة التحكم");
    await i18n.changeLanguage("en");
    expect(i18n.t("nav.subjects")).toBe("Subjects");
  });

  it("pluralizes by each language's rules", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("time.minutes", { count: 1 })).toBe("1 minute");
    expect(i18n.t("time.minutes", { count: 5 })).toBe("5 minutes");
    expect(i18n.t("search.resultCount", { count: 1 })).toBe("1 result");
    await i18n.changeLanguage("ar");
    expect(i18n.t("time.minutes", { count: 1 })).toBe("دقيقة واحدة");
    expect(i18n.t("time.minutes", { count: 2 })).toBe("دقيقتان");
    expect(i18n.t("time.minutes", { count: 5 })).toBe("5 دقائق");
    expect(i18n.t("time.minutes", { count: 11 })).toBe("11 دقيقة");
    expect(i18n.t("time.minutes", { count: 100 })).toBe("100 دقيقة");
    await i18n.changeLanguage("en");
  });

  it("interpolates dynamic values", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("countdown.inDays", { type: i18n.t("enums.deadlineType.exam"), count: 3 })).toBe("Exam in 3 days");
    expect(i18n.t("countdown.inDays", { type: i18n.t("enums.deadlineType.exam"), count: 1 })).toBe("Exam in 1 day");
    await i18n.changeLanguage("ar");
    expect(i18n.t("countdown.inDays", { type: i18n.t("enums.deadlineType.exam"), count: 3 })).toBe("امتحان بعد 3 أيام");
    await i18n.changeLanguage("en");
  });

  it("never shows a raw key for a missing translation", async () => {
    await i18n.changeLanguage("en");
    const out = i18n.t("dashboard.someMissingWidgetTitle");
    expect(out).toBe("Some missing widget title");
    expect(out).not.toContain(".");
    expect(missingKeys.has("dashboard.someMissingWidgetTitle")).toBe(true);
    // An explicit default value wins over the fallback text.
    expect(i18n.t("data.tables.not_a_table", { defaultValue: "not_a_table" })).toBe("not_a_table");
    expect(humanizeKey("notes.emptyHint_other")).toBe("Empty hint");
  });

  it("falls back to English when an Arabic string is missing", async () => {
    i18n.addResource("en", "translation", "test.onlyEnglish", "Only English");
    await i18n.changeLanguage("ar");
    expect(i18n.t("test.onlyEnglish")).toBe("Only English");
    await i18n.changeLanguage("en");
  });

  it("maps languages to text direction", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    // applyLanguage works without a DOM (the document part is exercised in the DOM test).
    applyLanguage("en");
    expect(i18n.language).toBe("en");
  });
});

describe("source audit", () => {
  it("uses translation keys (not literal text) in form field definitions", () => {
    expect(collect().badFieldText).toEqual([]);
  });

  it("has no hardcoded user-facing text outside the dictionaries", () => {
    // Deliberate exceptions: keyboard keys, URL/path examples, language endonyms and bilingual
    // content templates (roadmaps, note skeletons, default grade bands) that are chosen per language.
    const allowed = [
      /^src\/core\/templates\.ts:/,
      /^src\/core\/grading\/scales\.ts:/,
      /^src\/features\/onboarding\/Onboarding\.tsx:\d+\tarabic-literal\tمن اليمين إلى اليسار · RTL$/,
      /\tjsx-text\t(Ctrl\+B|Ctrl K|Ctrl\+S)$/,
      /\tattr:placeholder\t(https:\/\/|D:\\\\University Workspace)$/,
    ];
    const findings = (audit() as { where: string; kind: string; text: string }[]).map((f) => `${f.where.replace(/\\/g, "/")}\t${f.kind}\t${f.text}`);
    expect(findings.filter((f) => !allowed.some((re) => re.test(f)))).toEqual([]);
  });
});
