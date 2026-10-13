import { type Editor } from "@tiptap/react";
import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { WIDGET_TYPES, defaultConfig } from "../widgetCatalog";

// newWid generates a stable placeholder id for an inserted inline widget. Falls
// back when crypto.randomUUID is unavailable (older/insecure contexts).
function newWid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `w-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// WidgetInsertControl is the toolbar dropdown that inserts an inline widget node
// (with a fresh wid + per-type default config) at the caret.
export function WidgetInsertControl({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation();

  function insert(type: string) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "widget",
        attrs: { wid: newWid(), wtype: type, config: defaultConfig(type) },
      })
      .run();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!editor}
          aria-label={t("cms.pages.inline.insert")}
          title={t("cms.pages.inline.insert")}
        >
          <Blocks className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {WIDGET_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => insert(type)}>
            {t(`cms.pages.widget.${type}.name`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
