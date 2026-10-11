import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StringListFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Upper bound; the input hides once reached. */
  max?: number;
  maxLength?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// Free-form ordered tag input: type a value, press Enter (or comma) to add it.
// Backspace on an empty input removes the last chip, which is the convention
// every tag input shares. Duplicates and blanks are dropped silently — the user
// gets the same result either way, so an error would be noise.
export function StringListField({
  value,
  onChange,
  placeholder,
  max = 50,
  maxLength = 60,
  disabled,
  id,
  className,
}: StringListFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const atCapacity = value.length >= max;

  const commit = (raw: string) => {
    const next = raw.trim();
    if (!next || value.includes(next) || atCapacity) return;
    onChange([...value, next.slice(0, maxLength)]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      // Enter must not submit the surrounding form.
      e.preventDefault();
      commit(draft);
      setDraft("");
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
            >
              <span>{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={t("common.remove")}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && !atCapacity && (
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder ?? t("common.string_list.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          // Commit a half-typed value on blur so it is not silently lost.
          onBlur={() => {
            commit(draft);
            setDraft("");
          }}
        />
      )}
    </div>
  );
}
