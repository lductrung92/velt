import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiError } from "@/utils/apiError";
import { formatDateTime } from "@/utils/format";

import {
  useIssueMcpToken,
  useMcpTokens,
  useRevokeMcpToken,
} from "../hooks/useAi";
import type { IssuedToken } from "../services/ai.service";

/** A token past its expiry still lists, but it no longer authenticates. */
function expired(at: string | null): boolean {
  return !!at && new Date(at).getTime() <= Date.now();
}

// Credentials for agents (Claude Desktop, Claude Code) to reach the catalog
// and the pipeline over MCP.
//
// A long-lived credential with no revoke button is an operational hazard, which
// is why this panel exists at all rather than leaving the endpoints API-only.
export function McpTokensPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const tokens = useMcpTokens();
  const issue = useIssueMcpToken();
  const revoke = useRevokeMcpToken();

  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<IssuedToken | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const onIssue = () => {
    const name = label.trim();
    if (!name) return;
    issue.mutate(name, {
      onSuccess: (res) => {
        setFresh(res);
        setLabel("");
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  };

  return (
    <div className="space-y-4" data-testid="mcp-tokens">
      {/* The plaintext exists here and nowhere else, ever again. Saying so in
          the UI beats hoping the reader knows. */}
      {fresh && (
        <Alert variant="warning">
          {/* Alert renders `message` OR `children`, never both — so the
              headline text goes inside rather than in the message prop. */}
          <p>{t("ai.mcp.shown_once")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">
              {fresh.secret}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(fresh.secret);
                toast.success(t("common.copied"));
              }}
            >
              <Copy className="size-4" />
              {t("common.copy")}
            </Button>
          </div>
        </Alert>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="mcp-label" className="block">
              {t("ai.mcp.label")}
            </Label>
            <Input
              id="mcp-label"
              value={label}
              maxLength={120}
              placeholder={t("ai.mcp.label_ph")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={!label.trim() || issue.isPending}
            onClick={onIssue}
          >
            <KeyRound className="size-4" />
            {t("ai.mcp.issue")}
          </Button>
        </div>
      )}

      {tokens.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (tokens.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ai.mcp.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(tokens.data ?? []).map((tk) => (
            <li
              key={tk.id}
              data-testid="mcp-token-row"
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{tk.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {tk.hint}…{" "}
                  {tk.last_used_at
                    ? t("ai.mcp.last_used", { at: formatDateTime(tk.last_used_at) })
                    : t("ai.mcp.never_used")}
                </p>
                {/* A credential with an end date has to say so, or the day it
                    stops working looks like an outage. */}
                {tk.expires_at && !tk.revoked_at && (
                  <p className="text-xs text-muted-foreground">
                    {t(expired(tk.expires_at) ? "ai.mcp.expired_at" : "ai.mcp.expires_at", {
                      at: formatDateTime(tk.expires_at),
                    })}
                  </p>
                )}
              </div>
              {tk.revoked_at ? (
                <span className="text-xs text-muted-foreground">
                  {t("ai.mcp.revoked")}
                </span>
              ) : expired(tk.expires_at) ? (
                <span className="text-xs text-muted-foreground">
                  {t("ai.mcp.expired")}
                </span>
              ) : (
                canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("ai.mcp.revoke")}
                    title={t("ai.mcp.revoke")}
                    onClick={() => setPendingRevoke(tk.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
        title={t("ai.mcp.revoke")}
        description={t("ai.mcp.revoke_description")}
        confirmLabel={t("ai.mcp.revoke")}
        destructive
        onConfirm={() => {
          if (!pendingRevoke) return;
          revoke.mutate(pendingRevoke, {
            onSuccess: () => toast.success(t("ai.mcp.revoked_toast")),
            onError: (err) => toast.error(parseApiError(err, t).message),
          });
          setPendingRevoke(null);
        }}
      />
    </div>
  );
}
