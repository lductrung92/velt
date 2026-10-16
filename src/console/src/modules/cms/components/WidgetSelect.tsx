import Select from "react-select";
import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface WidgetSelectOption {
  value: string;
  label: string;
}

// Inside a Radix dialog the menu must NOT be portalled to <body>: the dialog
// traps pointer events, so a menu rendered outside it cannot be clicked (that
// is the bug this context was first added for). Rendering it in place keeps it
// inside the trap, and nothing in the dialog clips it — the form is not a
// scroll box. Everywhere else the menu still portals, because the inline
// widget card IS a clipping container.
const ModalWidgetControlsContext = createContext(false);
export function ModalWidgetControls({ children }: { children: ReactNode }) {
  return (
    <ModalWidgetControlsContext.Provider value={true}>
      {children}
    </ModalWidgetControlsContext.Provider>
  );
}

// react-select themed to match the shadcn input/popover look. Used for the enum
// fields in the inline-widget config forms. The menu is portalled to <body> so it
// is not clipped inside the editor's widget card / scroll container.
export function WidgetSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  inputId,
}: {
  value: string;
  options: WidgetSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  inputId?: string;
}) {
  const inModal = useContext(ModalWidgetControlsContext);
  return (
    <Select<WidgetSelectOption>
      inputId={inputId}
      aria-label={ariaLabel}
      isDisabled={disabled}
      isSearchable={false}
      unstyled
      classNamePrefix="rs"
      options={options}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(opt) => onChange(opt?.value ?? "")}
      menuPortalTarget={
        inModal || typeof document === "undefined" ? undefined : document.body
      }
      classNames={{
        control: ({ isFocused }) =>
          cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
            isFocused && "ring-2 ring-ring ring-offset-1",
            disabled && "cursor-not-allowed opacity-50",
          ),
        valueContainer: () => "gap-1 px-1",
        singleValue: () => "text-foreground",
        placeholder: () => "text-muted-foreground",
        indicatorSeparator: () => "hidden",
        dropdownIndicator: () => "px-1 text-muted-foreground",
        menu: () =>
          "mt-1 overflow-hidden rounded-md border bg-popover text-sm text-popover-foreground shadow-md",
        option: ({ isFocused, isSelected }) =>
          cn(
            "cursor-pointer px-3 py-1.5",
            isFocused && "bg-accent text-accent-foreground",
            isSelected && "font-medium",
          ),
      }}
      styles={{
        // react-select keeps a default control min-height (38px) even when
        // unstyled; pin it to 36px (h-9) so the control lines up exactly with the
        // Input / Button height in shared form rows.
        control: (base) => ({
          ...base,
          minHeight: "2.25rem",
          height: "2.25rem",
        }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        // In a dialog the menu is a normal child, so it needs to sit above the
        // fields under it rather than rely on the portal's z-index.
        menu: (base) => ({ ...base, zIndex: 50 }),
      }}
    />
  );
}
