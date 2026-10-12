import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import "./slug-field.css";

interface Props {
  /** Label for the row, e.g. "Đường dẫn". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What Cancel restores — the slug as it was last saved. */
  original: string;
  /**
   * Shown in place of an empty value — the address this record falls back to,
   * e.g. the source language's slug when a translation has none of its own.
   */
  emptyValue?: string;
  /**
   * Language for this component's own words. Defaults to the console's, but a
   * translation form renders in the language being written, and a Vietnamese
   * "Sửa" button in the middle of an English form is exactly the kind of mix
   * that makes people type into the wrong box.
   */
  locale?: string;
  /** False → read-only, with no way in (the allow_slug_edit flag is off). */
  canEdit?: boolean;
  disabled?: boolean;
}

/**
 * The saved URL of a record, shown read-only with a way to unlock it.
 *
 * Locked by default on purpose. A slug is an address that has been handed out,
 * linked to and indexed; changing one is a decision, not a side effect of
 * retyping the title. Making the edit deliberate is what keeps it from being
 * changed by accident.
 *
 * There is no slug field at all before the first save: the server derives it
 * from the title, and offering an empty box would only invite a worse answer.
 */
export function SlugField({
  label,
  value,
  onChange,
  original,
  emptyValue,
  locale,
  canEdit = true,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const tl = (key: string) => (locale ? t(key, { lng: locale }) : t(key));
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="slug-field">
        <span className="slug-field-label">{label}</span>
        <span
          className="slug-field-value"
          data-inherited={!value && emptyValue ? "" : undefined}
        >
          {value || emptyValue || "—"}
        </span>
        {canEdit && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="slug-field-action"
            data-action="edit"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
            {tl("common.edit")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="slug-field" data-editing>
      <span className="slug-field-label">{label}</span>
      <Input
        autoFocus
        maxLength={300}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="slug-field-action"
        data-action="cancel"
        onClick={() => {
          onChange(original);
          setEditing(false);
        }}
      >
        {tl("common.cancel")}
      </Button>
    </div>
  );
}
