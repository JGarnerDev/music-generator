---
type: doc
purpose: Notable changes to the engine, scripts, app, schemas and docs, newest first. Bump rules are in CLAUDE.md (Non-negotiables → Versioning).
audience: [claude, human]
updated: 2026-11-20
---

# Changelog

Grouped `Added` / `Changed` / `Removed` / `Fixed`. New compositions, palettes, voices, plans and renders stay out; they live in git history. The version in [`VERSION`](VERSION) (and `version` in `package.json`) always matches the top entry below.

## [0.2.0] — 2026-11-20

### Added

- Shared formatting and lint setup from the hub starter: `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `.oxlintrc.json` (Prettier 3.10.1 and oxlint 1.94.0, pinned exact), and `.claude/rules/LINT.md`, which says how to avoid each lint error (a line is added after each hand fix). The pre-commit hook formats and lints staged code; oxlint errors block the commit.

### Changed

- Code reformatted with Prettier; no behavior change.
- Hooks follow the React Compiler rules: `useMediaQuery` uses `useSyncExternalStore`, `useHotkeys` and `useSessions` use `useEffectEvent`, and refs that track props are assigned in `useLayoutEffect`.

### Removed

- Unused code: `beatsInto` in `tempo.ts`, and unused imports and test helpers.

## [0.1.0] — 2026-11-18

### Added

- Versioning starts here. Earlier history is in `git log`.

### Changed

- Doc files are upper case: `CLAUDE.md`, `README.md` (also in `recordings/`). The backlog `progress.md` is now `TODO.md`. The Redwater brief and tracker are `tasks/redwater/PLAN.md` and `TODO.md`, and those two are tracked in git; commission output in `tasks/` stays local.
