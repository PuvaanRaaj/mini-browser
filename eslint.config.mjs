import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["out/**", "release/**", "extension/**", "node_modules/**"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // The renderer and main-process boundaries use a few intentionally
      // dynamic Electron values. TypeScript still checks their public types.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
