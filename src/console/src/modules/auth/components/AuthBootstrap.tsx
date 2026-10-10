import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useBootstrapAuth } from "../hooks/useBootstrapAuth";

// Blocks the app shell until the first-load session restore settles, so a
// returning user isn't flashed the login screen before /auth/refresh resolves.
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const ready = useBootstrapAuth();

  if (!ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-sm text-muted-foreground">
          {t("common.loading")}
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
