import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type FocusEventHandler } from "react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps<Option extends SelectOption = SelectOption> {
  options: Option[];
  value?: Option | null;
  onChange?: (option: Option | null) => void;
  placeholder?: string;
  invalid?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** Show the ✕ that clears the selection. Default true. */
  isClearable?: boolean;
  /** Show the search input inside the menu. Default true. */
  isSearchable?: boolean;
  /** id forwarded to the trigger so a <label htmlFor> associates. */
  inputId?: string;
  /** Accessible name when there is no visible label — a filter in a toolbar,
   *  say. A combobox without one is unusable by screen reader and unfindable by
   *  role in a test. */
  "aria-label"?: string;
  /** Forwarded to the trigger. react-hook-form passes its own onBlur to mark a
   *  field touched; without this the control can never leave `untouched` and
   *  validation that waits for blur never fires. */
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  /** Controlled search term — provide with `onInputChange` for server-side
   *  filtering (internal filtering is then disabled). */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /** Debounce (ms) before `onInputChange` fires. */
  searchDebounceMs?: number;
  className?: string;
}

// Searchable single-select built on Popover + cmdk. Clearable, with optional
// debounced server-side search (`onInputChange`). docs/styles/console select.
export function Select<Option extends SelectOption = SelectOption>({
  options,
  value,
  onChange,
  placeholder,
  invalid,
  isDisabled,
  isLoading,
  isClearable = true,
  isSearchable = true,
  inputId,
  "aria-label": ariaLabel,
  onBlur,
  inputValue,
  onInputChange,
  searchDebounceMs = 250,
  className,
}: SelectProps<Option>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const controlledSearch = onInputChange !== undefined;

  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleSearch(next: string) {
    setSearch(next);
    if (!controlledSearch) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => onInputChangeRef.current?.(next),
      searchDebounceMs,
    );
  }

  function reset() {
    setSearch("");
    clearTimeout(timerRef.current);
  }

  function select(option: Option | null) {
    onChange?.(option);
    setOpen(false);
    reset();
  }

  const showClear = isClearable && !!value && !isDisabled;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (isDisabled) return;
        setOpen(next);
        if (next) setSearch(controlledSearch ? (inputValue ?? "") : "");
        else reset();
      }}
    >
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <button
            type="button"
            id={inputId}
            role="combobox"
            aria-label={ariaLabel}
            onBlur={onBlur}
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            disabled={isDisabled}
            className={cn(
              "flex h-9 w-full items-center rounded-md border bg-background px-3 py-1 text-left text-sm ring-offset-background transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              showClear ? "pr-14" : "pr-9",
              invalid ? "border-destructive" : "border-input",
              className,
            )}
          >
            <span
              className={cn(
                "truncate",
                value ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {value ? value.label : (placeholder ?? "")}
            </span>
          </button>
        </PopoverTrigger>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-muted-foreground">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {showClear ? (
            <button
              type="button"
              aria-label={t("common.clear")}
              // Always visible, like DateField's clear. It used to be revealed
              // by `group-hover`, but `group` sits on the trigger and this
              // button is the trigger's SIBLING, so the variant could never
              // match: an invisible yet clickable target inside the trigger's
              // right edge. On touch there is no hover at all, so a tap meant
              // for the menu silently wiped the selection. Full trigger height
              // and the width the `pr-14` reserve already allows for.
              className="pointer-events-auto grid h-full w-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => select(null)}
            >
              <X className="size-4" />
            </button>
          ) : null}
          <ChevronsUpDown className="size-4 opacity-50" />
        </div>
      </div>
      {/* The menu starts at the trigger's width and grows to fit the longest
          option: pinning it to the trigger truncated every label whenever the
          control was narrow, which is exactly where a reader needs the full
          text. The cap keeps it inside the viewport. */}
      <PopoverContent
        align="start"
        className="w-auto min-w-[var(--radix-popover-trigger-width)] max-w-[min(26rem,var(--radix-popover-content-available-width))] p-0"
      >
        <Command shouldFilter={!controlledSearch}>
          {isSearchable ? (
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={handleSearch}
            />
          ) : null}
          <CommandList>
            <CommandEmpty>
              {isLoading ? t("common.loading") : t("common.no_results")}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => select(option)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value?.value === option.value
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
