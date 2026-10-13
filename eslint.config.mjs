import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "dist/**", "**/*.d.ts"] },
  { files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"], extends: [js.configs.recommended, ...tseslint.configs.recommended] },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" }
  },
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"],
    rules: {
      // Mã hiện có nhiều `any`: cảnh báo để giảm dần, chưa chặn CI.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // Các `@ts-ignore` hiện có đều kèm lý do (import package JS); bắt buộc giữ lý do.
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
      // Báo nhầm với biến dùng trong decorator (@Body(pipe)) và mẫu khởi tạo trước try/catch.
      "no-useless-assignment": "off"
    }
  }
);
