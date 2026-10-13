import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

// Password input with a show/hide toggle inside the same border
// (styles/console/input.md §11). Toggle is tabIndex=-1 so tab order stays on
// the input; aria-label is i18n. Never use a bare <Input type="password">.
export interface PasswordFieldProps extends Omit<
  React.ComponentProps<"input">,
  "type"
> {
  invalid?: boolean;
}

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  PasswordFieldProps
>(({ className, invalid, ...props }, ref) => {
  const { t } = useTranslation();
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
          invalid &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25 aria-[invalid=true]:border-destructive",
          className,
        )}
        aria-invalid={invalid}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={
          visible ? t("common.hide_password") : t("common.show_password")
        }
        title={visible ? t("common.hide_password") : t("common.show_password")}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordField.displayName = "PasswordField";
