import { useEffect, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

import { hexToHslTriplet } from "@/utils/color";

import { useAppConfig } from "./useAppConfig";

/**
 * Applies runtime branding from the public settings config to the document.
 * Renders nothing; mounted once at the app root inside QueryClientProvider so
 * `useAppConfig` has a client.
 *
 *  - primary colour → `--primary` + `--ring` set inline on `<html>`. Inline
 *    styles beat the stylesheet, so this overrides both the light `:root` and
 *    `.dark` blocks in index.css without touching markup. When unset/invalid the
 *    inline overrides are removed so the CSS defaults win again.
 *  - language switcher disabled → lock the UI locale to the configured default.
 */
export function BrandingThemeApplier() {
  const { data: cfg } = useAppConfig();
  const { i18n } = useTranslation();

  // Treat the former theme default as the new Zukatek blue; explicit custom
  // branding remains configurable through public settings.
  const primaryColor =
    cfg?.primaryColor?.trim().toLowerCase() === "#1da2b5"
      ? "#0061fd"
      : cfg?.primaryColor;
  // Layout effect (pre-paint) so the brand colour is already on `<html>` for the
  // first painted frame — no flash of the default `--primary`.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const triplet = primaryColor ? hexToHslTriplet(primaryColor) : null;
    if (!triplet) {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      return;
    }
    root.style.setProperty("--primary", triplet);
    root.style.setProperty("--ring", triplet);
  }, [primaryColor]);

  const switcherEnabled = cfg?.languageSwitcherEnabled;
  const fallbackLocale = cfg?.defaultLocale ?? "vi";
  useEffect(() => {
    if (switcherEnabled === false && i18n.language !== fallbackLocale) {
      void i18n.changeLanguage(fallbackLocale);
    }
  }, [switcherEnabled, fallbackLocale, i18n]);

  return null;
}
