---
title: Vision & Intent
purpose: Why this project exists — use cases, desired outcomes, and the design philosophy behind the first principles. Read for intent; readme.md for how, progress.md for what's next.
audience: [claude, human]
updated: 2026-08-12
read_order: 3
see_also: [readme.md, progress.md]
status: living
---

# Vision & Intent

Make music in code through conversation with Claude. Fun, productive, quick —
with depth on demand. This doc holds the *why*; the
[readme](../readme.md) turns it into working first principles.

## Who it's for (two use cases)

1. **D&D DM scoring a scene.** The user runs a game and wants music to make a
   moment land. The result should be a genuinely moving piece that makes the
   session better than it had any right to be.
2. **Loose musical ideas → a product.** The user has inspiration but unformed
   ideas. They should leave *pumped* — happy with the act of creating and with
   the generated result.

## Desired outcomes

- Describe a mood, a film scene, a poem — anything — and the process after that
  is fluent. Claude is proactive first, then seeks adjustments.
- The resulting music is easily playable and easy to export.

## Design philosophy

- **Palettes carry the theory, keyed to feeling.** "A sad song for the scene
  where my dog dies" should immediately make sense: look up theory for *sad*,
  *death*, *friend*, *bittersweet*. Genre works the same — "a badass metal song"
  → look up *badass*, *intense*, *metal*. A local semantic search may come later
  if keyword matching gets weak (YAGNI until then).
- **Don't store specific inspirations — derive them.** No "Kill Bill music
  theory" on disk. The most precise stored concept is something like
  *spaghetti-western* or *samurai movie*; anything more specific is derived in
  conversation by combining primitive palette elements.
- **Sample first, not a full song.** A whole song up front is too much work.
  Make a sample — ideally the best, most moving parts — and check in for
  direction.

## Tech stance

- Stack choice is open: go with the best recommended tooling for making lo-fi
  music in code. (Current: Vite + TS + Tone.js, tonal for theory — see readme.)
- Export must be easy. WAV via offline render is the default.

## Repository mandates

These are enforced across [readme.md](../readme.md) and
[CLAUDE.md](../CLAUDE.md):

- Every markdown file has detailed frontmatter; read frontmatter before the body
  for context efficiency.
- Promote scripts for repeatable deterministic work; when unscripted work proves
  repeatable, script it.
- `readme.md` is the router — where to find things and the fundamental
  principles. `CLAUDE.md` holds instructions but mostly points to the readme.
- Keep both readme and CLAUDE.md at a reasonable size. A subject that outgrows
  them gets its own progressively-disclosed doc.
- File structure emerges as work proceeds; it should serve workshopping,
  creating, describing, and playing music through conversation.
- Ephemeral outputs may be gitignored.
