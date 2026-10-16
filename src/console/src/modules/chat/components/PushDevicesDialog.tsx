import { Bell, Laptop, Loader2, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { parseApiError } from "@/utils/apiError";
import { formatDateTime } from "@/utils/format";

import { usePushDevices } from "../hooks/usePushDevices";

/** Lets somebody on chat duty turn desktop notifications on for the browser
 *  they are in, and see or drop the other browsers they have turned them on
 *  for. One row per browser install, because that is what a push subscription
 *  actually is. */
export function PushDevicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { supported, permission, devices, enable, remove, thisEndpoint } =
    usePushDevices();

  const items = devices.data ?? [];
  const here = items.find((device) => device.endpoint === thisEndpoint);

  const turnOn = () =>
    enable.mutate(undefined, {
      onSuccess: () => toast.success(t("chat.push.enabled")),
      onError: (error) =>
        toast.error(
          error instanceof Error && error.message === "denied"
            ? t("chat.push.blocked")
            : parseApiError(error),
        ),
    });

  const drop = (id: string, label: string) =>
    remove.mutate(id, {
      onSuccess: () => toast.success(t("chat.push.removed", { label })),
      onError: (error) => toast.error(parseApiError(error)),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <ModalHeader
          icon={Bell}
          title={t("chat.push.title")}
          subject={t("chat.push.subtitle")}
        />

        {!supported ? (
          <Alert variant="warning" message={t("chat.push.unsupported")} />
        ) : permission === "denied" ? (
          <Alert variant="warning" message={t("chat.push.blocked")} />
        ) : !here ? (
          <Alert variant="info" message={t("chat.push.off_here")} />
        ) : null}

        {devices.isPending ? (
          <p className="text-muted-ink py-4 text-center text-sm">
            <Loader2 className="inline size-4 animate-spin" aria-hidden />
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-ink py-4 text-center text-sm">
            {t("chat.push.none")}
          </p>
        ) : (
          <ul className="divide-border divide-y" data-testid="push-devices">
            {items.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Laptop
                    className="text-muted-ink size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {device.label || t("chat.push.unnamed")}
                      {device.endpoint === thisEndpoint && (
                        <em className="text-primary-ink ml-1.5 text-xs not-italic">
                          {t("chat.push.this_device")}
                        </em>
                      )}
                    </span>
                    <span className="text-muted-ink block text-xs">
                      {device.last_used_at
                        ? t("chat.push.last_used", {
                            at: formatDateTime(device.last_used_at),
                          })
                        : t("chat.push.never_used")}
                    </span>
                  </span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("chat.push.remove_aria", {
                    label: device.label || t("chat.push.unnamed"),
                  })}
                  disabled={remove.isPending}
                  onClick={() =>
                    drop(device.id, device.label || t("chat.push.unnamed"))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {t("common.close")}
          </Button>
          {supported && !here && permission !== "denied" && (
            <Button type="button" disabled={enable.isPending} onClick={turnOn}>
              {enable.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Bell className="size-4" aria-hidden />
              )}
              {t("chat.push.enable")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
