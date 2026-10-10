import { create } from "zustand";

// Theme = explicit light/dark or follow the OS ("system"). The choice is
// persisted; the resolved value drives the `dark` class on <html> (Tailwind
// darkMode: "class"). docs/styles/console tokens swap via that class only.
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "velt.theme";

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function readStored(): Theme {
  // Default = light when the user hasn't chosen yet (not OS-driven); "system"
  // stays available as an explicit choice in the toggle.
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStored(),
  setTheme: (theme) => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// Apply once at module load + keep "system" in sync with OS changes.
applyTheme(readStored());
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (readStored() === "system") applyTheme("system");
    });
}
