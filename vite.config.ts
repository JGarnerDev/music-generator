/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { libraryApi } from "./src/dev/library-api";

export default defineConfig({
  // Dev-only: lets the bench's delete button move a composition into _trash.
  plugins: [libraryApi(resolve(__dirname, "compositions"))],
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@utils": resolve(__dirname, "src/utils"),
      "@app": resolve(__dirname, "src/app"),
    },
  },
  test: {
    // Pure logic (engine/utils/scripts) runs in node. Audio/browser code is
    // not unit-tested here; keep it thin and drive it manually in the app.
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/engine/**", "src/utils/**"],
    },
  },
});
