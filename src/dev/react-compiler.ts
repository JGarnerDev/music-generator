/**
 * React Compiler, for both Vite configs (the app and the standalone keys build).
 *
 * The compiler does the memoizing, so the components carry no `useMemo`,
 * `useCallback` or `memo` of their own. It runs in Vitest too: the preset skips
 * non-browser environments, and the tests should run the code the app runs.
 * jeff-ui is a `file:` link outside `node_modules`, so its source is compiled
 * here as well.
 */
import { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

export function reactCompiler() {
  const preset = reactCompilerPreset();
  preset.rolldown.applyToEnvironmentHook = undefined;
  return babel({ presets: [preset] });
}
