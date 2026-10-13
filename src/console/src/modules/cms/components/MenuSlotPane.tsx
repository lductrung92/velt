import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { MenuSlot } from "../services/menus.service";

// Left pane: the list of menu slots + a "create menu" CTA. Owns the slot-list
// 3-state guard (loading / error / empty). Selecting a row drives the builder.
export function MenuSlotPane({
  slots,
  isLoading,
  isError,
  errorMessage,
  selectedId,
  canManage,
  onSelect,
  onCreate,
  onEditSlot,
  onDeleteSlot,
}: {
  slots: MenuSlot[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  selectedId: string | null;
  canManage: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEditSlot: (slot: MenuSlot) => void;
  onDeleteSlot: (slot: MenuSlot) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {isError ? (
        <Alert variant="danger" message={errorMessage} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          title={t("cms.menus.empty_title")}
          description={t("cms.menus.empty_desc")}
          onAdd={canManage ? onCreate : undefined}
        />
      ) : (
        <>
          <ul className="space-y-1.5">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors",
                  slot.id === selectedId
                    ? "border-primary bg-accent"
                    : "bg-background hover:bg-muted/30",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(slot.id)}
                >
                  <span className="block truncate text-sm font-medium">
                    {slot.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {slot.location}
                  </span>
                </button>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("common.actions")}
                        title={t("common.actions")}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditSlot(slot)}>
                        <Pencil className="size-4" />
                        {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive-ink focus:text-destructive-ink"
                        onClick={() => onDeleteSlot(slot)}
                      >
                        <Trash2 className="size-4" />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onCreate}
            >
              <Plus className="size-4" />
              {t("cms.menus.create")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
