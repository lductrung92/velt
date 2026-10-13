import { Languages, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";

/**
 * One landing section in the site's other languages.
 *
 * A section has no fixed set of text fields — a hero has a heading, an FAQ has
 * a list of questions, and the catalogue has nineteen types — so this dialog is
 * built from the section's OWN config: every string in it becomes a box, in the
 * order it appears. That is why there is no per-type form here and no second
 * place to update when a section type gains a field.
 *
 * What is not a string is not shown: limits, ids, flags and media paths are the
 * same page in every language. A box left empty keeps the published text, which
 * is what the site serves.
 */

interface TextNode {
  /** Where the value lives in the config, e.g. ["items", "0", "question"]. */
  path: string[];
  original: string;
}

/** Every string in the published config, depth first, in document order. */
function collectText(value: unknown, path: string[] = []): TextNode[] {
  if (typeof value === "string") {
    return value.trim() ? [{ path, original: value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectText(item, [...path, String(i)]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => collectText(child, [...path, key]),
    );
  }
  return [];
}

function readAt(source: unknown, path: string[]): string {
  let current: unknown = source;
  for (const step of path) {
    if (current === null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[step];
  }
  return typeof current === "string" ? current : "";
}

/**
 * Writes one value into a copy of `source`, creating the objects and arrays on
 * the way. The shape mirrors the published config, because that is what the
 * server merges it onto, field by field.
 */
function writeAt(source: unknown, path: string[], value: string): unknown {
  const [head, ...rest] = path;
  const intoArray = /^\d+$/.test(head);
  const base: Record<string, unknown> | unknown[] = intoArray
    ? Array.isArray(source)
      ? [...(source as unknown[])]
      : []
    : source && typeof source === "object" && !Array.isArray(source)
      ? { ...(source as Record<string, unknown>) }
      : {};
  const next = rest.length
    ? writeAt(
        (base as Record<string, unknown>)[head] as unknown,
        rest,
        value,
      )
    : value;
  if (Array.isArray(base)) {
    base[Number(head)] = next;
  } else {
    (base as Record<string, unknown>)[head] = next;
  }
  return base;
}

export function SectionTranslateDialog({
  open,
  onOpenChange,
  sectionId,
  sectionLabel,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionLabel: string;
  config: unknown;
}) {
  const { t } = useTranslation();
  const tr = useEntityTranslation("landing_section", sectionId);
  const [saving, setSaving] = useState(false);
  const nodes = useMemo(() => collectText(config), [config]);
  const others = tr.tabs.filter((code) => code !== tr.baseLocale);
  const locale = tr.locale;
  const draft = (tr.values.config as unknown) ?? {};

  // The source language is the designer's own form; this dialog is for the
  // others, so it opens on one of them. Without this the typed text would be
  // stored against the base language, which is to say thrown away.
  const { isBase, setLocale } = tr;
  const first = others[0];
  useEffect(() => {
    if (first && isBase) setLocale(first);
  }, [first, isBase, setLocale]);

  async function save() {
    setSaving(true);
    try {
      await tr.flush(sectionId);
      toast.success(t("cms.landings.translate.saved"));
      onOpenChange(false);
    } catch {
      toast.error(t("errors.unknown"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="size-4 text-muted-foreground" aria-hidden />
            {t("cms.landings.translate.title", { section: sectionLabel })}
          </DialogTitle>
        </DialogHeader>

        {others.length > 1 && (
          <div className="flex gap-1" role="group" aria-label={t("tr.tabs")}>
            {others.map((code) => (
              <Button
                key={code}
                type="button"
                size="sm"
                variant={code === locale ? "secondary" : "ghost"}
                aria-pressed={code === locale}
                onClick={() => tr.setLocale(code)}
              >
                {code.toUpperCase()}
              </Button>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("cms.landings.translate.hint")}
        </p>

        <div className="space-y-4">
          {nodes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("cms.landings.translate.empty")}
            </p>
          )}
          {nodes.map((node) => {
            const id = `tr-${node.path.join("-")}`;
            const value = readAt(draft, node.path);
            const long = node.original.length > 70 || node.original.includes("\n");
            const onChange = (next: string) =>
              tr.setField("config", writeAt(draft, node.path, next));
            return (
              <div key={id} className="space-y-1">
                <Label htmlFor={id} className="font-mono text-xs">
                  {node.path.join(" › ")}
                </Label>
                {/* The published text is the placeholder: an empty box means
                    "keep it", which is exactly what the site does. */}
                {long ? (
                  <Textarea
                    id={id}
                    rows={3}
                    value={value}
                    placeholder={node.original}
                    onChange={(e) => onChange(e.target.value)}
                  />
                ) : (
                  <TextField
                    id={id}
                    value={value}
                    placeholder={node.original}
                    onChange={(e) => onChange(e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
