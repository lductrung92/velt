import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// shadcn/ui token-driven theme. Colors are CSS variables (see src/index.css)
// so light/dark themes swap by changing the variables, not the classes.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // text-primary-ink: --primary is byte-identical in both themes
          // because branding can override it at runtime, which left primary
          // TEXT at 3.93:1 on the dark page. This one flips.
          ink: "hsl(var(--primary-ink))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          // text-destructive-ink: the red for TEXT and ICONS. The DEFAULT above
          // is a fill tuned against --destructive-foreground, so reading it as
          // a text colour measured 3.76:1 in light and 2.03:1 in dark.
          ink: "hsl(var(--destructive-ink))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          ink: "hsl(var(--success-ink))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          ink: "hsl(var(--warning-ink))",
        },
        purple: {
          DEFAULT: "hsl(var(--purple))",
          ink: "hsl(var(--purple-ink))",
        },
        earth: {
          DEFAULT: "hsl(var(--earth))",
          ink: "hsl(var(--earth-ink))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Alert danger token (styles/console: <Alert variant="danger">).
        danger: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        caption: ["var(--font-size-caption)", { lineHeight: "1rem" }],
        xs: ["var(--font-size-xs)", { lineHeight: "1rem" }],
        compact: ["var(--font-size-compact)", { lineHeight: "1.25rem" }],
        sm: ["var(--font-size-sm)", { lineHeight: "1.25rem" }],
        base: ["var(--font-size-base)", { lineHeight: "1.5rem" }],
        lg: ["var(--font-size-lg)", { lineHeight: "1.75rem" }],
        xl: ["var(--font-size-xl)", { lineHeight: "1.75rem" }],
        "2xl": ["var(--font-size-2xl)", { lineHeight: "2rem" }],
        "3xl": ["var(--font-size-3xl)", { lineHeight: "2.25rem" }],
        "4xl": ["var(--font-size-4xl)", { lineHeight: "2.5rem" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
