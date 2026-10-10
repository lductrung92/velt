import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// Lightweight checkbox built on a native input (no extra Radix dep). The native
// input stays accessible + focusable; we overlay the visual box and a check.
export interface CheckboxProps extends Omit<
  React.ComponentProps<"input">,
  "type"
> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, checked, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    return (
      <label
        htmlFor={inputId}
        className="flex w-fit cursor-pointer items-center gap-2"
      >
        <span className="relative inline-flex size-4 items-center justify-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            checked={checked}
            className={cn(
              "peer size-4 cursor-pointer appearance-none rounded-sm border border-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...props}
          />
          <Check className="pointer-events-none absolute hidden size-3 text-primary-foreground peer-checked:block" />
        </span>
        {label && <span className="text-sm leading-none">{label}</span>}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
