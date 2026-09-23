import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { ar } from "./ar";

export type Lang = "ar" | "en";
export const LANGS: Lang[] = ["ar", "en"];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: "ar",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switches language and document direction (RTL for Arabic). */
export function applyLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

export default i18n;
