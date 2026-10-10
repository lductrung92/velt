import type { ReactNode } from "react";

// Minimal centered card shell for the pre-auth pages (login/forgot/reset).
// Brand logo (public/logo.png) + centered title/subtitle sit above the form;
// the form itself keeps its normal left-aligned fields.
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-md border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <img src="/logo.png" alt="" className="mb-3 h-12 w-auto" />
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
