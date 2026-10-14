import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { WidgetSelect } from "./WidgetSelect";
import { renderWidgetForm, type WidgetConfig } from "./widgetCatalog";
import { blockLabel } from "../utils/regionBlocks";

import type { MenuSlot } from "../services/menus.service";
import type { BlockDraft } from "../utils/regionBlocks";

// Right column: the config editor for whichever block is selected. Widget forms
// are the catalog's own — this pane only routes the value in and out.
export function BlockSettingsPane({
  block,
  menus,
  onConfigChange,
  onMenuChange,
}: {
  block: BlockDraft | null;
  menus: MenuSlot[];
  onConfigChange: (config: WidgetConfig) => void;
  onMenuChange: (menuId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("cms.appearance.settings")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {!block ? (
          <p className="text-sm text-muted-foreground">
            {t("cms.appearance.settings_hint")}
          </p>
        ) : block.kind === "menu" ? (
          <div className="space-y-2">
            <Label htmlFor="block-menu">{t("cms.appearance.which_menu")}</Label>
            <WidgetSelect
              inputId="block-menu"
              value={block.menu_id ?? ""}
              options={menus.map((m) => ({ value: m.id, label: m.name }))}
              onChange={onMenuChange}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium">{blockLabel(block, menus, t)}</p>
            {renderWidgetForm(
              block.widget_type ?? "",
              block.config,
              onConfigChange,
              false,
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
