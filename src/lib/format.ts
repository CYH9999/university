import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import { parseDateKey } from "@/core/utils/dates";

export const locale = () => (i18n.language === "ar" ? arLocale : enUS);
/** Intl locale: Arabic text with Latin digits keeps numbers, codes and times readable. */
export const intlLocale = () => (i18n.language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB");

export function fmtDate(key: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!key) return "";
  const d = key.length <= 10 ? parseDateKey(key) : parseISO(key);
  return isValid(d) ? format(d, pattern, { locale: locale() }) : key;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "d MMM yyyy, HH:mm", { locale: locale() }) : iso;
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? formatDistanceToNowStrict(d, { addSuffix: true, locale: locale() }) : "";
}

export function fmtWeekday(d: Date, long = true): string {
  return format(d, long ? "EEEE" : "EEE", { locale: locale() });
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(), { style: "currency", currency, maximumFractionDigits: currency === "IQD" ? 0 : 2 }).format(amount);
  } catch {
    return `${fmtNumber(amount, 2)} ${currency}`;
  }
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  const t = i18n.t.bind(i18n);
  if (h && m) return t("time.hoursMinutes", { h, m });
  if (h) return t("time.hours", { count: h });
  return t("time.minutes", { count: m });
}

/** "12:30" in the user's language (24h clock, Latin digits). */
export function fmtTime(t: string | null | undefined): string {
  return t ?? "";
}
