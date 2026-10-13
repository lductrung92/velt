import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAppConfig } from "@/app/useAppConfig";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// vi (default) + en — i18n persists the choice on languageChanged (app/i18n.ts).
const LOCALES = [
  { code: "vi", short: "VI", name: "Tiếng Việt", flag: "/flags/vn.svg" },
  { code: "en", short: "EN", name: "English", flag: "/flags/gb.svg" },
] as const;

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const { data: cfg } = useAppConfig();

  // Admin can hide the switcher org-wide (settings.app.language_switcher_enabled).
  // Default while loading/unset = shown; only an explicit `false` hides it.
  if (cfg?.languageSwitcherEnabled === false) return null;

  const current =
    LOCALES.find((l) => i18n.language?.startsWith(l.code)) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <img
            src={current.flag}
            alt=""
            width={18}
            height={12}
            className="block"
          />
          <span className="font-medium">{current.short}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LOCALES.map((l) => {
          const active = current.code === l.code;
          return (
            <DropdownMenuItem
              key={l.code}
              onSelect={() => void i18n.changeLanguage(l.code)}
              className={cn("gap-2", active && "font-medium")}
              aria-current={active || undefined}
            >
              <img src={l.flag} alt="" width={20} height={14} />
              <span className="flex-1">{l.name}</span>
              {active && <Check className="h-4 w-4 text-primary-ink" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
