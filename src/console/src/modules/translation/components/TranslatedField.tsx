import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";

interface Props {
  /** Unique id, so the label points at the control it describes. */
  id: string;
  label: string;
  /** The source-language value, shown for reference. */
  source?: string | null;
  /** The input itself, already bound by the caller. */
  children: ReactNode;
  /** Lets a screen give one field the same treatment its own form gives it. */
  className?: string;
}

/**
 * One translatable field: the input, with the original underneath.
 *
 * The original is always on screen rather than a tab away. Asking a translator
 * to remember the sentence they are translating, or to keep switching tabs to
 * re-read it, is the kind of friction that makes people stop translating.
 */
export function TranslatedField({
  id,
  label,
  source,
  children,
  className,
}: Props) {
  const { t } = useTranslation();
  const text = source?.trim() ?? "";
  return (
    <div className={className}>
      {/* A plain Label, not FormLabel: these inputs live outside the article's
          react-hook-form, and FormLabel reads a FormField context that is not
          there. */}
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2">{children}</div>
      <p className="tr-field-source" data-empty={!text || undefined}>
        <span>{t("tr.source_value")}</span>
        <span>{text || t("tr.source_empty")}</span>
      </p>
    </div>
  );
}
