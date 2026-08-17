/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { libraryApi } from "./src/dev/library-api";
import { liveLibrary } from "./src/dev/live-library";
import { studyApi } from "./src/dev/study-api";
import { voiceApi } from "./src/dev/voice-api";

export default defineConfig({
  plugins: [
    // Dev-only: lets the bench's delete button move a composition into _trash.
    libraryApi(resolve(__dirname, "compositions")),
    // Dev-only: Approve / Fork in the voices bench, writing voices/ + the archive.
    voiceApi(resolve(__dirname, "voices")),
    // Dev-only: the thumb buttons in the studies bench, writing studies/ + the ledger.
    studyApi(resolve(__dirname, "studies")),
    // Dev-only: a new composition / voice / render reaches the open tab without
    // a restart. Vite alone does not — see the plugin's header.
    liveLibrary(__dirname),
  ],
  build: {
    // Three pages: the composition, voice and studies benches. `render.html` is
    // deliberately absent — it is dev-only machinery for `npm run render`.
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        voices: resolve(__dirname, "voices.html"),
        studies: resolve(__dirname, "studies.html"),
      },
    },
  },
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
