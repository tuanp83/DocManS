import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Test giao diện (React Testing Library). Chạy: npm run test:web
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@rtms/permissions": path.resolve(__dirname, "../../packages/permissions/src/index.ts"),
      "@rtms/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      "@rtms/validation": path.resolve(__dirname, "../../packages/validation/src/index.ts"),
      "@rtms/ui-tokens": path.resolve(__dirname, "../../packages/ui-tokens/src/index.ts")
    }
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    globals: false,
    restoreMocks: true
  }
});
