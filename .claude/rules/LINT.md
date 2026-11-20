---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.py"
---

# Lint rules

The pre-commit hook formats staged code (Prettier, `ruff format`) and lints it (oxlint, `ruff check`). Lint errors block the commit. Configs: `.oxlintrc.json`, `ruff.toml`, `.prettierrc.json`, all shared across Jeff's projects.

Run by hand:

- JS/TS: `npm run lint`, `npm run format`
- Python: `uvx ruff@0.17.6 check --fix .`, `uvx ruff@0.17.6 format .`

**When you fix a lint error, add a line below** on how to write the code so it doesn't come back: the rule id, then what to do instead. Write code that follows these from the start. If an entry would help every project, also add it to the hub starter's copy (`Organized/.claude/skills/new-project/starter/.claude/rules/LINT.md`).

## How to avoid each error

- `ruff B007` (loop variable not used): name it `_` or `_name`.
- `react(refs)` (ref read or written during render): for "latest handler" use `useEffectEvent`; a ref that must track a prop gets assigned in `useLayoutEffect(() => { r.current = v; })`, not in the body. Destructure a hook's callback ref (`const { ref: scrubRef, ...scrub } = useScrubBar(...)`) rather than reading `obj.ref` in JSX.
- `react(set-state-in-effect)`: subscribe to outside state (media queries, stores) with `useSyncExternalStore`, not `useEffect` + `setState`.
- `react-hooks(exhaustive-deps)`: an effect that runs a plain function once (a first load) calls it through `useEffectEvent`.
- `react(immutability)` (closure reassigns a render local): build arrays with a `for` loop and `push`, not a `map` callback that bumps an outer `let`.
- `vitest(no-conditional-expect)`, `vitest(expect-expect)`: filter first, assert the filtered list is non-empty, then assert each item; no `expect` inside `if`.
- `eslint(no-unused-vars)`: delete unused imports, helpers and test fixtures; don't keep dead code around for reference.
