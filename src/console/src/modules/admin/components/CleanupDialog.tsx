import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ModalHeader } from "@/components/common/ModalHeader";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { parseApiError } from "@/utils/apiError";

import {
  RETENTION_WINDOWS,
  type RetentionWindow,
} from "../services/purge.service";

interface Option {
  value: RetentionWindow;
  label: string;
}

/**
 * Retention clean-up for a list that only ever grows (the activity log, the
 * session list).
 *
 * The window names a point in the past and says what to KEEP: "3 ngày trước"
 * keeps the last three days and permanently deletes everything older. "Tất cả"
 * keeps nothing. Nothing is preselected on purpose — this deletes rows, so the
 * choice has to be made, not confirmed.
 */
export function CleanupDialog({
  open,
  onOpenChange,
  subject,
  warning,
  pending,
  onPurge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which screen is being cleaned, for the header's second line. */
  subject: string;
  /** What exactly is lost, in the screen's own words. */
  warning: string;
  pending: boolean;
  /** Runs the purge and reports it; rejecting keeps the dialog open. */
  onPurge: (olderThan: RetentionWindow) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [olderThan, setOlderThan] = useState<RetentionWindow | "">("");

  useEffect(() => {
    if (open) setOlderThan("");
  }, [open]);

  const options: Option[] = RETENTION_WINDOWS.map((value) => ({
    value,
    label: t(`admin.cleanup.window.${value}`),
  }));

  async function handlePurge() {
    if (!olderThan) return;
    try {
      await onPurge(olderThan);
      onOpenChange(false);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={Trash2}
          title={t("admin.cleanup.title")}
          subject={subject}
        />
        <Alert variant="danger" message={warning} />
        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            {t("admin.cleanup.window_label")}
          </span>
          <Select<Option>
            inputId="admin-cleanup-window"
            aria-label={t("admin.cleanup.window_label")}
            isSearchable={false}
            options={options}
            value={options.find((o) => o.value === olderThan) ?? null}
            placeholder={t("admin.cleanup.window_ph")}
            onChange={(option) => setOlderThan(option?.value ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            {t("admin.cleanup.window_hint")}
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handlePurge()}
            loading={pending}
            disabled={!olderThan}
          >
            <Trash2 className="size-4" />
            {t("admin.cleanup.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
