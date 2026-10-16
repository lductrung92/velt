import { GitMerge, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ModalHeader } from "@/components/common/ModalHeader";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { parseApiError } from "@/utils/apiError";

import { useMergeTags } from "../hooks/useCmsTags";
import type { Tag } from "../services/tags.service";

interface Option {
  value: string;
  label: string;
}

// Merge `source` into a chosen target: every article tagged `source` is retagged
// to the target and `source` is deleted (POST /cms/tags/merge). The picker is
// pre-filtered to exclude the source so self-merge can't be selected.
export function TagMergeDialog({
  open,
  onOpenChange,
  source,
  targetOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Tag | null;
  targetOptions: Option[];
}) {
  const { t } = useTranslation();
  const merge = useMergeTags();
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    if (open) setTargetId("");
  }, [open, source]);

  async function handleMerge() {
    if (!source || !targetId) return;
    try {
      await merge.mutateAsync({ source_id: source.id, target_id: targetId });
      toast.success(t("cms.tags.toast.merge_success"));
      onOpenChange(false);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={GitMerge}
          title={t("cms.tags.dialog.merge.title")}
          subject={source?.name ?? ""}
        />
        <p className="text-sm text-muted-foreground">
          {t("cms.tags.dialog.merge.desc", { name: source?.name ?? "" })}
        </p>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            {t("cms.tags.dialog.merge.target")}
          </span>
          <Select<Option>
            inputId="cms-tag-merge-target"
            options={targetOptions}
            value={targetOptions.find((o) => o.value === targetId) ?? null}
            placeholder={t("cms.tags.dialog.merge.target_ph")}
            onChange={(o) => setTargetId(o?.value ?? "")}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={merge.isPending}
          >
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleMerge()}
            loading={merge.isPending}
            disabled={!targetId}
          >
            <GitMerge className="size-4" />
            {t("cms.tags.btn.merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
