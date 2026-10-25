import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    pool: "threads",
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/test/**",
        "src/components/ui/**",
        "src/lib/api-types.gen.ts",
        "**/*.d.ts",
      ],
      // Gates sit just below the measured all-app baseline (8.8/4.0/6.1/9.2 —
      // the suite covers lib logic and key components, not yet the ~30 pages)
      // so any regression fails CI while existing code keeps passing. Raise
      // them as coverage grows — never lower them.
      thresholds: {
        statements: 8.5,
        branches: 3.5,
        functions: 5.5,
        lines: 8.5,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
