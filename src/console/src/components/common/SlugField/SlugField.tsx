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
  canEdit = true,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="slug-field">
        <span className="slug-field-label">{label}</span>
        <span className="slug-field-value">{value || "—"}</span>
        {canEdit && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="slug-field-action"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
            {t("common.edit")}
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
        onClick={() => {
          onChange(original);
          setEditing(false);
        }}
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}
