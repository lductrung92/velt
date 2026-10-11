import { lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import "./auth-layout.css";

const AuthMotionBackground = lazy(() => import("./AuthMotionBackground"));
const motionViewportQuery = "(min-width: 768px)";
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia?.(motionViewportQuery);
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}
function viewportSnapshot() {
  return window.matchMedia?.(motionViewportQuery).matches ?? false;
}
const staticViewportSnapshot = () => false;

// Shared visual shell; each auth page owns its form and authentication flow.
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const showMotion = useSyncExternalStore(
    subscribeViewport,
    viewportSnapshot,
    staticViewportSnapshot,
  );

  return (
    <div className="auth-shell">
      {showMotion && (
        <Suspense fallback={null}>
          <AuthMotionBackground />
        </Suspense>
      )}
      <main className="auth-panel">
        <div className="auth-form-group">
          <img
            src="/logo.png"
            alt="Zukatek"
            width={1222}
            height={249}
            className="auth-form-logo"
          />
          <div className="auth-form">
            <div className="auth-form-heading">
              <div className="auth-form-title">
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
              </div>
            </div>
            {children}
          </div>
        </div>
        <footer className="auth-panel-footer">
          {t("auth.layout.copyright", { year: new Date().getFullYear() })}
        </footer>
      </main>
    </div>
  );
}
