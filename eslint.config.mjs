import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/.turbo/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" }
  }
)
