---
title: The composition library
purpose: How compositions/ is organised (kinds = folders = tabs), and how leitmotifs get quoted by other pieces. Read before saving or reclassifying a composition.
audience: [claude, human]
updated: 2026-08-13
read_order: 5
see_also: [../readme.md, looping.md, ../src/engine/library.ts]
status: living
---

# The composition library

`compositions/` is filed by **kind**, one folder per kind, and the bench shows
one tab per folder. **The folder is the kind** — there is no `kind:` field to
keep in sync, so "reclassify" literally means "move the file".

```
compositions/
  leitmotifs/   short memorable themes, written to be quoted elsewhere
  segments/     one-shot takes: the moving core of an idea, a few bars
  loops/        has a `loop` window; repeats under a scene forever
  songs/        long-form pieces, usually expanded from plans/
  _trash/       deleted from the bench — gitignored, recoverable
```

| Kind | Write one when | Made by |
|---|---|---|
| `segments` | You're sampling an idea to check in with the user | `npm run compose` (default) |
| `loops` | It plays under a game scene on repeat → read [looping](looping.md) | `npm run song:build` on a plan with `loopFrom` |
| `songs` | It plays through once and ends | `npm run song:build` on a plan without `loopFrom` |
| `leitmotifs` | It's a theme for a character/place/idea that other pieces will quote | `npm run compose -- --kind leitmotifs` |

New compositions land in `segments/` unless you say otherwise. Nothing is lost
if you drop a JSON at the root of `compositions/`: the bench still lists it,
filed by shape (a `loop` window ⇒ a loop, otherwise a segment).

## Filing and refiling

```bash
npm run compositions:organize                     # dry run: loose files + broken motif links
npm run compositions:organize -- --apply          # sweep loose files into their folders
npm run compositions:organize -- --file compositions/segments/ashen-king.json \
    --kind leitmotifs --apply                     # promote one piece
```

Both write paths take `--kind`:
`npm run compose -- --mood "…" --kind leitmotifs`, and
`npm run song:build -- --plan plans/x.json --kind songs`.

## Leitmotifs

Opera logic: a theme belongs to a character, a place or an idea, and it comes
back — transposed, slowed, in a different voice — whenever that thing is on
stage. Write it **once**, in `compositions/leitmotifs/`, then have other pieces
point at it rather than copying it:

```jsonc
{
  "name": "throne-room",
  "motifs": ["ashen-king"],   // slugs of compositions/leitmotifs/*.json
  "tags": ["act-3", "castle"]
}
```

The link is provenance, not playback — the app doesn't splice the motif in for
you. It answers "where does this theme show up?" (the bench shows `♪ quoted ×3`
on the motif's row) and it keeps a recurring idea from silently forking into
four near-identical versions. `npm run compositions:organize` reports any
`motifs` entry with no matching file, so a broken quote surfaces instead of
rotting.

Keep a leitmotif **short and singable** — a phrase, not an arrangement. Two to
eight bars, one or two voices, no lo-fi bed. It exists to be recognised at half
speed under a battle, so anything that isn't the tune is in the way.

## Tags

`tags: [...]` is free-form: scene, campaign, session, character — whatever you'd
type into the bench's filter box to find the piece again. With no `tags`, the
bench falls back to showing the piece's `palettes` provenance, so old
compositions are still findable by mood.

## Deleting

The bench's 🗑 button **moves** the file to `compositions/_trash/` (mirroring its
kind folder) through a dev-server-only endpoint — see
[`src/dev/library-api.ts`](../src/dev/library-api.ts). It never unlinks, and
`_trash/` is gitignored, so a mis-click costs a drag back. Nothing in the built
bundle can touch the filesystem.
