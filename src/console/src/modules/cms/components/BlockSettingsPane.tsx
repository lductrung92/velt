import { useTranslation } from "react-i18next";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { ModalHeader } from "@/components/common/ModalHeader";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";

import { ModalWidgetControls } from "./WidgetSelect";
import { renderWidgetForm, type WidgetConfig } from "./widgetCatalog";
import { blockLabel } from "../utils/regionBlocks";
import { readAt, textFields, writeAt } from "../utils/widgetText";

import type { MenuSlot } from "../services/menus.service";
import type { BlockDraft } from "../utils/regionBlocks";

/**
 * One block's settings, as a dialog.
 *
 * It edits a COPY and writes it back on submit, which is what makes Huỷ mean
 * something. Typing straight through to the page draft read as a form but had
 * no way to back out of it: the dialog looked like every other one here and
 * then behaved unlike all of them.
 *
 * Submit still only reaches the page's draft — the page's own Save is what
 * writes to the server — so the footer says Xong, not Lưu.
 */
export function BlockSettingsPane({
  block,
  menus,
  onConfigChange,
  onTranslations,
  onClose,
}: {
  block: BlockDraft | null;
  menus: MenuSlot[];
  onConfigChange: (config: WidgetConfig) => void;
  /** The other languages typed here, by locale, for the page's own save. */
  onTranslations?: (pending: Record<string, Record<string, unknown>>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const returnFocus = useRef<HTMLElement | null>(null);
  const [config, setConfig] = useState<WidgetConfig>({});
  // A menu block carries no prose of its own — the menu's own items are
  // translated where they are written.
  const translatable = block?.kind === "widget";
  const tr = useEntityTranslation(
    "region_block",
    translatable ? (block?.id ?? undefined) : undefined,
  );
  const draft = (tr.values.config ?? {}) as WidgetConfig;
  const fields = translatable
    ? textFields(block?.widget_type ?? null, config)
    : [];
  const others = tr.tabs.filter((locale) => locale !== tr.baseLocale);
  const showTranslations = tr.enabled && others.length > 0 && fields.length > 0;

  // The Vietnamese boxes are the form above, so the section opens on one of the
  // other languages: what is typed while the source tab is open would be stored
  // against the source, which is to say thrown away.
  const { isBase, setLocale } = tr;
  const first = others[0];
  useEffect(() => {
    if (first && isBase) setLocale(first);
  }, [first, isBase, setLocale]);

  // Reseed whenever a different block is opened; the dialog outlives them.
  useEffect(() => {
    if (!block) return;
    setConfig(block.config);
  }, [block]);

  function apply() {
    if (!block) return;
    onConfigChange(config);
    // A translation is stored against the block's id, which a block added in
    // this session has not got yet — so it travels back with the values and
    // the page writes it once its own save hands out the ids. Both cases go
    // the same way, so nothing on this screen is written before Save.
    if (translatable) onTranslations?.(tr.pending);
    onClose();
  }

  return (
    <Dialog open={!!block} onOpenChange={(open) => !open && onClose()}>
      {/* The house dialog with nothing added. An earlier cut capped the height
          and put the fields in their own scroll box; because the form is
          display:contents the dialog's grid could not shrink to match, so the
          cap simply CLIPPED — a hairline across the last field and the footer
          pushed out of sight. No other dialog here caps its height, and a tall
          form is allowed to make a tall dialog. */}
      <DialogContent
        closeLabel={t("common.close")}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus({ preventScroll: true });
          }
        }}
      >
        <ModalHeader
          icon={SlidersHorizontal}
          title={t("cms.appearance.settings")}
          subject={block ? blockLabel(block, menus, t) : undefined}
        />
        {/* A real form, like every other dialog here. Edits already reach the
          draft as they are typed — the page's own Save writes them — so
          submitting means "I am finished", and Enter does what Enter does
          everywhere else instead of nothing. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
          // space-y-6, not -4: the house dialog's last element is a padded
          // card, so its buttons end up ~29px below the final line of text.
          // With plain inputs the same -4 leaves only 16px and the action row
          // reads as one more field rather than as the end of the form.
          className="space-y-6"
        >
          <ModalWidgetControls>
            {block && (
              // Named for the same reason the translation group below is: the
              // two now carry the same field labels, and something has to tell
              // the source language from the other one.
              <div className="space-y-4" data-testid="block-form">
                {renderWidgetForm(
                  block.widget_type ?? "",
                  config,
                  setConfig,
                  false,
                )}
              </div>
            )}
          </ModalWidgetControls>

          {/* The other language under the form rather than beside it: only the
              prose has a second version, and the category, the order and the
              limit are one choice for every reader. A form that let those be
              re-picked per language would be offering to break the block. */}
          {showTranslations && (
            <div
              className="space-y-2 rounded-md border bg-muted/20 p-3"
              role="group"
              // Named, because each box inside now carries the same label as
              // the field it translates in the form above: the group is what
              // tells the two apart, for a screen reader and for a test.
              aria-label={t("cms.appearance.translate_heading")}
              data-testid="block-translations"
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`tr-${fields[0].path.join("-")}`}>
                  {t("cms.appearance.translate_heading")}
                </Label>
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label={t("tr.tabs")}
                >
                  {others.map((locale) => (
                    <Button
                      key={locale}
                      type="button"
                      size="sm"
                      variant={locale === tr.locale ? "secondary" : "ghost"}
                      aria-pressed={locale === tr.locale}
                      onClick={() => tr.setLocale(locale)}
                    >
                      {locale.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              {fields.map((field) => {
                const id = `tr-${field.path.join("-")}`;
                const onChange = (next: string) =>
                  tr.setField("config", writeAt(draft, field.path, next));
                // The field's NAME is a label, not a placeholder: a
                // placeholder leaves as soon as somebody types, so a box that
                // had been translated no longer said what it was. The
                // Vietnamese it will fall back to is the placeholder instead —
                // which is what the hint below promises and what the site does.
                return (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={id} className="text-xs font-medium">
                      {t(field.labelKey)}
                    </Label>
                    {field.long ? (
                      <Textarea
                        id={id}
                        rows={4}
                        value={readAt(draft, field.path)}
                        placeholder={field.original}
                        onChange={(e) => onChange(e.target.value)}
                      />
                    ) : (
                      <TextField
                        id={id}
                        value={readAt(draft, field.path)}
                        placeholder={field.original}
                        onChange={(e) => onChange(e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
              <p className="text-xs leading-5 text-muted-foreground">
                {t("cms.appearance.translate_hint")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
            <Button type="submit">
              <Check className="size-4" />
              {t("common.done")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
