import { ListTree, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export function MenuEmptyState({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation();

  return (
    <section
      className="overflow-hidden rounded-xl border bg-background"
      aria-labelledby="menu-empty-title"
    >
      <div className="flex flex-col items-center px-6 py-12 text-center sm:py-14">
        <div className="relative mb-7 h-32 w-56" aria-hidden="true">
          <div className="absolute inset-x-5 inset-y-0 rounded-full bg-primary/5" />
          <div className="absolute left-3 top-3 w-44 overflow-hidden rounded-lg border bg-background shadow-sm">
            <div className="flex h-8 items-center gap-1 border-b px-3">
              <span className="size-1.5 rounded-full bg-primary/50" />
              <span className="size-1.5 rounded-full bg-border" />
              <span className="size-1.5 rounded-full bg-border" />
              <span className="ml-auto h-1 w-5 rounded bg-primary/25" />
              <span className="h-1 w-5 rounded bg-border" />
              <span className="h-1 w-5 rounded bg-border" />
            </div>
            <div className="space-y-2 p-4">
              <div className="h-2 w-20 rounded bg-muted" />
              <div className="h-1.5 w-full rounded bg-muted/70" />
              <div className="h-1.5 w-24 rounded bg-muted/70" />
            </div>
          </div>
          <div className="absolute bottom-0 right-2 flex size-16 items-center justify-center rounded-xl border border-primary/20 bg-background text-primary-ink shadow-sm">
            <ListTree className="size-8" strokeWidth={1.5} />
          </div>
        </div>
        <h2
          id="menu-empty-title"
          className="text-xl font-medium tracking-tight"
        >
          {t("cms.menus.empty_title")}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {t("cms.menus.onboarding.description")}
        </p>
        {onCreate && (
          <Button type="button" className="mt-6" onClick={onCreate}>
            <Plus className="size-4" aria-hidden />
            {t("cms.menus.onboarding.create")}
          </Button>
        )}
      </div>
      <ol className="grid gap-4 border-t bg-muted/20 px-6 py-5 sm:grid-cols-3 sm:gap-6 sm:px-8">
        {["location", "links", "arrange"].map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 text-sm text-muted-foreground"
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {t(`cms.menus.onboarding.${step}`)}
          </li>
        ))}
      </ol>
    </section>
  );
}
