import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores(["out/**", "release/**", "extension/**", "node_modules/**"]),
]);

export default eslintConfig;
