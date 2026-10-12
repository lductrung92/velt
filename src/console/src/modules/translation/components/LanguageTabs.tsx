import { AlertCircle, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { EntityTranslation } from "../hooks/useEntityTranslation";
import "./language-tabs.css";

// Display names for the languages the module can be configured with. A locale
// with no entry here shows its own code, which is better than an empty tab.
const LOCALE_LABEL: Record<string, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

interface Props {
  tr: EntityTranslation;
  /** Create screens have no record yet, so there is nothing to translate. */
  disabled?: boolean;
  /**
   * Render as a slot inside the editor action bar rather than as a band of its
   * own: no card chrome, just a divider and the tabs.
   */
  embedded?: boolean;
}

/**
 * The language switcher that sits above the editor body.
 *
 * It carries a progress count per language because the fallback rule makes a
 * half-translated page look finished to a reader: every untranslated field
 * quietly serves the Vietnamese one. This count is the only place that
 * unfinished work is visible, so it is part of the control rather than a detail
 * tucked inside the form.
 */
export function LanguageTabs({ tr, disabled, embedded }: Props) {
  const { t } = useTranslation();
  if (!tr.enabled || tr.tabs.length < 2) return null;

  return (
    <div className="tr-tabs" data-embedded={embedded || undefined}>
      <span className="tr-tabs-icon" aria-hidden>
        <Languages className="size-4" />
      </span>
      <div className="tr-tabs-list" role="tablist" aria-label={t("tr.tabs")}>
        {tr.tabs.map((loc) => {
          const active = loc === tr.locale;
          const isBase = loc === tr.baseLocale;
          const { done, total } = tr.progress(loc);
          return (
            <button
              key={loc}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled && !isBase}
              className="tr-tab"
              data-active={active || undefined}
              onClick={() => tr.setLocale(loc)}
            >
              {LOCALE_LABEL[loc] ?? loc.toUpperCase()}
              {isBase ? (
                <span className="tr-tab-chip" data-kind="source">
                  {t("tr.source")}
                </span>
              ) : (
                <span
                  className="tr-tab-chip"
                  data-kind={done === total && total > 0 ? "done" : "partial"}
                >
                  {done}/{total}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tr.requiresRepublish && (
        <span className="tr-tabs-notice">
          <AlertCircle className="size-3.5" aria-hidden />
          {t("tr.needs_republish")}
        </span>
      )}
    </div>
  );
}
