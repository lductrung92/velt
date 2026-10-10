import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en/translation.json";
import vi from "@/locales/vi/translation.json";

const STORAGE_KEY = "velt.local.vne";
const stored =
  typeof window !== "undefined"
    ? window.localStorage.getItem(STORAGE_KEY)
    : null;

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: stored === "en" || stored === "vi" ? stored : "vi", // vi default (CLAUDE.md)
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  if (typeof window !== "undefined")
    window.localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
