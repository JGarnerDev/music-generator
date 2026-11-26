---
type: doc
purpose: Notable changes to the engine, scripts, app, schemas and docs, newest first. Bump rules are in CLAUDE.md (Non-negotiables → Versioning).
audience: [claude, human]
updated: 2026-11-26
---

# Changelog

Grouped `Added` / `Changed` / `Removed` / `Fixed`. New compositions, palettes, voices, plans and renders stay out; they live in git history. The version in [`VERSION`](VERSION) (and `version` in `package.json`) always matches the top entry below.

## [0.5.1] — 2026-11-26

### Changed

- The keys page's piano and drum pads are jeff-ui's `PianoKeys` and `DrumPads` (jeff-ui 3.0.0); `keys.css` keeps only the page layout.
- The pre-commit hook runs `jeff-ui-css-check` on staged CSS: raw colors, `.ui-*` selectors and `:root` custom properties fail the commit.

### Fixed

- The keys spec's octave test finds the stepper by its `octave` class and the "increase octave" button, not jeff-ui's internal classes.

## [0.5.0] — 2026-11-23

### Added

- `scripts/run.ts`, the hub starter's start-or-reuse launcher: `npm run app` (`node scripts/run.ts up app`) starts the bench server or reuses the one running, and `job transcribe|render|study-render -- <args>` runs those jobs unless one is already running (two sessions once transcribed the same take at once). `list`, `stop <name>` and `prune` manage them; config is `scripts/run.json`, state `.run/` (gitignored).
- Claude Code hooks in `.claude/settings.json`: session start shows what's running, a PreToolUse hook blocks `npx vite`, `npm run transcribe`, `npm run render` and `npm run study:render` in favour of the launcher, and session end stops the servers that session started (`npm run app -- --keep` survives).

### Changed

- **Breaking:** `npm run app` is the one start script; `dev` and `preview` are removed (`preview:keys` stays for the keys deploy check).
- The dev server has a fixed port, <http://localhost:5175/>, with `strictPort`, so a second copy fails instead of moving to the next port. The keys spec and `session:new` point there.
- The docs, script hints and bench messages say `npm run app` and `node scripts/run.ts job render|transcribe|study-render -- …` where they said `npm run …`.
- `tsconfig.json` allows `.ts` import paths (`allowImportingTsExtensions`, with `noEmit`), as `run.ts` uses them.

## [0.4.0] — 2026-11-22

### Changed

- All five bench pages are built from jeff-ui 2.2.0 components on the dusk theme, and their CSS only places things and reads `--ui-*` tokens (491 lines, from 1,683): `Link variant="nav"`, `Text` with `lines` for the fixed-height lines, `Row equal` for the button rows, `Box inset` for the approach and notes panels.
- The library, cue, archive, study and voice lists are jeff-ui `Table`s (`frame` where the list scrolls), so their columns, selection and empty messages come from one component. A cue's note is now a real button.
- Studies: the thumbs take `hue` instead of their own classes, and the tag shelf is one inline `Field` per facet.
- Keys: the settings menu is a jeff-ui `Popover` with a `RadioGroup` of monitors, now at the right end of the row; the octave is a `Stepper`; the piano and pads take their colors from the theme.
- The four list benches share `src/app/frame.css` for the page frame.

### Removed

- The apps' own palettes and bare element rules, and dead keys rules (`#controls`, `#shelf`, the `recording`/`armed`/`bending` button states).

## [0.3.1] — 2026-11-20

### Changed

- The apps import `jeff-ui/base.css` (0.10.0) and drop their own body and box-sizing rules; bare `h1`, `button`, `select` and `input` rules sit in `@layer ui.elements`, under jeff-ui's components. In keys, hover no longer changes a `.bending` key's background.

## [0.3.0] — 2026-11-20

### Changed

- The React apps compile with React Compiler (`src/dev/react-compiler.ts`, in both Vite configs and in Vitest), so hooks and pages drop `useMemo` and `useCallback`. Effects take callbacks through `useEffectEvent`; `useApi` returns a module constant; code the compiler would skip (`try`/`finally`, ternaries inside a `try`) moved into helpers.

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
