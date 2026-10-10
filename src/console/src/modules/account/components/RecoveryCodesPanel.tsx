import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Recovery codes are shown ONCE (BE stores only hashes). Local-state only — never
// cached/persisted. The "I saved them" checkbox gates the Done button so the user
// can't dismiss without acknowledging (docs/screens/account-two-factor/ui-layout §3).
export function RecoveryCodesPanel({
  codes,
  onDone,
  doneLoading = false,
}: {
  codes: string[];
  onDone: () => void;
  doneLoading?: boolean;
}) {
  const { t } = useTranslation();
  const [acked, setAcked] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(t("account.2fa.copied"));
    } catch {
      // Clipboard blocked (insecure context / permissions) — non-fatal.
    }
  }

  function download() {
    const blob = new Blob([codes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "velt-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Alert variant="danger" message={t("account.2fa.recovery_warning")} />

      <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy className="size-4" />
          {t("common.copy")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="size-4" />
          {t("common.download")}
        </Button>
      </div>

      <Checkbox
        checked={acked}
        onChange={(e) => setAcked(e.target.checked)}
        label={t("account.2fa.recovery_saved_ack")}
      />

      <Button
        type="button"
        className="w-full"
        disabled={!acked}
        loading={doneLoading}
        onClick={onDone}
      >
        {t("common.done")}
      </Button>
    </div>
  );
}
