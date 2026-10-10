import js from "@eslint/js";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "e2e", "playwright.config.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      i18next,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Zero hardcoded user-facing strings in JSX (styles/console/skill §4.1).
      "i18next/no-literal-string": [
        "warn",
        { markupOnly: true, ignoreAttribute: ["data-testid", "to", "autoComplete", "type", "name", "id"] },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // Tests + non-UI files don't need the i18n literal rule.
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**", "src/**/*.service.ts"],
    rules: { "i18next/no-literal-string": "off" },
  },
);
