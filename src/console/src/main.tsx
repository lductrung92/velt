import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";

import { BrandingThemeApplier } from "@/app/BrandingThemeApplier";
import i18n from "@/app/i18n";
import { queryClient } from "@/app/queryClient";
import { router } from "@/app/router";
import { AuthBootstrap } from "@/modules/auth";

import "@/index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BrandingThemeApplier />
        <AuthBootstrap>
          <RouterProvider router={router} />
        </AuthBootstrap>
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
