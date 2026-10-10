import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { isKnownWidget, renderWidgetForm, type WidgetConfig } from "../widgetCatalog";
import { WidgetPreview } from "../widgetPreview";

// WidgetNodeView renders an inline widget inside the rich-text editor: a bordered
// card with a collapsible header (📦 name + collapse/delete) and, when expanded,
// two tabs — Config (the per-type sub-form, bound to the node's `config` attr) and
// Preview (a visual approximation). contentEditable={false} so ProseMirror does
// not treat the form inputs as editable document text.
export function WidgetNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("config");
  const wtype = (node.attrs.wtype as string) ?? "";
  const config = (node.attrs.config as WidgetConfig) ?? {};
  const editable = editor.isEditable;
  const known = isKnownWidget(wtype);
  const name = t(`cms.pages.widget.${wtype}.name`, { defaultValue: wtype });

  return (
    <NodeViewWrapper
      className="kd-inline-widget my-3 rounded-md border border-dashed bg-muted/40"
      contentEditable={false}
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1 text-sm font-medium hover:bg-muted"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "cms.pages.inline.expand" : "cms.pages.inline.collapse")}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          <span>📦 {name}</span>
        </button>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("cms.pages.inline.remove")}
            onClick={() => deleteNode()}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>

      {!collapsed &&
        (known ? (
          <Tabs value={tab} onValueChange={setTab} className="p-3">
            <TabsList className="mb-3">
              <TabsTrigger value="config">{t("cms.pages.inline.config")}</TabsTrigger>
              <TabsTrigger value="preview">{t("cms.pages.inline.preview")}</TabsTrigger>
            </TabsList>
            <TabsContent value="config" className="space-y-3">
              {renderWidgetForm(wtype, config, (v) => updateAttributes({ config: v }), !editable)}
            </TabsContent>
            <TabsContent value="preview">
              <WidgetPreview type={wtype} config={config} />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">{t("cms.pages.blocks.no_editor")}</p>
        ))}
    </NodeViewWrapper>
  );
}
