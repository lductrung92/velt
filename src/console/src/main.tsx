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
        <Toaster
          richColors
          closeButton
          position="top-right"
          toastOptions={{
            classNames: {
              // sonner parks the ✕ half outside the card's top-left corner,
              // which at 390px put it 7px off the card and 9px from the screen
              // edge. Bring it inside the card's top-right instead; `pr-9`
              // keeps the text from running under it.
              closeButton:
                "left-auto right-1.5 top-1.5 size-7 transform-none [@media(pointer:coarse)]:size-9",
              // sonner's own 13px is the only body text in the console that is
              // not 14px/20px.
              toast: "pr-9 text-sm",
              title: "leading-5",
            },
          }}
        />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
