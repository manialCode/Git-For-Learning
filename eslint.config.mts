import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, "@typescript-eslint": tsPlugin as unknown as Plugin },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
  },
  // TypeScript recommended config
]);
