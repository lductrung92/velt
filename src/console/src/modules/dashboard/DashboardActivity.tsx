import { ArrowRight, Bot, History, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/modules/admin/hooks/useActivity";
import type { ActivityEntry } from "@/modules/admin/services/activity.service";
import { formatDateTime } from "@/utils/format";

// One request serves both views: the card shows the newest few, "Xem tất cả"
// opens the rest in a modal. Cleaning up the log is NOT offered here — that
// deletes rows for good and belongs on the admin screen.
const CARD_ENTRIES = 5;
const MODAL_ENTRIES = 20;

function EntryList({ entries }: { entries: ActivityEntry[] }) {
  const { t } = useTranslation();
  // Codes outlive their translations, so an unknown one shows itself.
  const label = (code: string) =>
    t(`activity.action.${code}`, { defaultValue: code });

  return (
    <ul className="divide-y" data-testid="dashboard-activity-list">
      {entries.map((entry) => {
        const Icon = entry.actor_id ? User : Bot;
        return (
          <li
            key={entry.id}
            className="flex items-start gap-3 px-5 py-3.5"
            data-testid="dashboard-activity-entry"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {label(entry.action)}
              </p>
              {entry.entity_label && (
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={entry.entity_label}
                >
                  {entry.entity_label}
                </p>
              )}
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {entry.actor_label} · {formatDateTime(entry.occurred_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardActivity() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = useActivity({ page: 1, page_size: MODAL_ENTRIES });
  const entries = list.data?.items ?? [];

  return (
    <section className="dashboard-activity dashboard-panel min-w-0 rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-base font-medium">
          <History className="size-4 text-muted-foreground" aria-hidden />
          {t("activity.title")}
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => setOpen(true)}
          >
            {t("dashboard.view_all")}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      {list.isPending ? (
        <div className="space-y-4 p-5" aria-label={t("common.loading")}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="flex min-h-60 flex-col items-center justify-center gap-4 px-5 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            {t("dashboard.load_error")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void list.refetch()}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : !entries.length ? (
        <div className="flex min-h-60 flex-col items-center justify-center gap-2 px-5 text-center">
          <History
            className="size-7 text-muted-foreground/60"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm font-medium">{t("activity.empty_title")}</p>
        </div>
      ) : (
        <EntryList entries={entries.slice(0, CARD_ENTRIES)} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("common.close")} className="max-w-2xl">
          <ModalHeader
            icon={History}
            title={t("activity.title")}
            subject={t("activity.list_hint")}
          />
          <div className="-mx-6 border-y">
            <EntryList entries={entries} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
