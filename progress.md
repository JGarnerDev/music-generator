---
title: Progress & Roadmap
purpose: Prioritized backlog of what to build. Living doc — check items off, reorder as reality shifts.
audience: [claude, human]
updated: 2026-08-15
read_order: 2
see_also: [readme.md, docs/vision.md]
status: living
---

# Progress & Roadmap

Ordered by priority. **P0** = the music itself is the product; nothing ships
above it. **P1** = makes the core loop good. **P2** = app architecture &
hosting. **P3** = depth/polish. **P4** = nice-to-have / speculative.

Legend: `[ ]` todo · `[~]` in progress. **Delete an item once it's done** — this
doc is the *remaining* backlog, not a changelog. Git history is the record of what
shipped; keep this list short and forward-looking.

## P0 — The voice shelf

**Shipped 2026-08-15. Nothing left here.**

The decision was that the shelf comes before the songs: `compositions/` was
emptied on 2026-08-14, and the materials — not the tooling — are what decide
whether the *next* piece is rich or is the last piece again. The shelf now
stands at 40 approved voices: `lead/` 9, `pad/` 4, `bass/` `pluck/` `drums/` 7
each, `piano/` and `epiano/` 3 each.

What we learned about composing is parked in
[`docs/variety.md`](./docs/variety.md) — the knobs, the rules for choosing them,
and the engine gaps found the hard way. Read it before writing a plan.

## P1 — Make the core loop *good*

**Shipped 2026-08-15, except the one item below.** The engine work (knobs, meter,
modes, fills, humanize, sections, signal chains, motif quoting, song form) and
the palette shelf (14 emotions, 39 genres, 13 timbres, 4 spaces, 3 eras) are
done; see [`docs/knobs.md`](./docs/knobs.md) and the "what the engine gained"
section of [`docs/variety.md`](./docs/variety.md).

**Guitar transcription shipped 2026-08-17** — `npm run transcribe`, a recorded
take read back as scale degrees, emitted as a leitmotif, and A/B'd against the
recording in the bench. See [`docs/transcribe.md`](./docs/transcribe.md).

- [ ] **Sampled instruments and kit via `smplr`.** Swap synth piano/pad/drums for
      real samples behind the same instrument interface. **Blocked on a decision,
      not on code:** `smplr` resolves its packs from remote CDNs
      (`smpldsnds.github.io`, `gleitz.github.io`), and `assets/samples/` is empty
      and gitignored by an explicit earlier decision that sample packs are too
      large to commit. Wiring it as-is makes every render depend on the network
      and stop being reproducible — the property
      [`docs/rendering.md`](./docs/rendering.md) went to some trouble for (see the
      seeded impulse response). Pick one:
  - commit a small curated pack and load from disk;
  - allow a network fetch at render time, and accept that a render is no longer
    hermetic;
  - add a `sampler` voice kind that loads a local pack when present and falls
    back to the synth voice when it isn't, so the shelf degrades rather than
    breaks.

      Note the synth voices are not a placeholder that failed — they audition
      instantly with nothing downloaded, which is why they were chosen. The gain
      here is realism on `piano`/`pad`/`drums` specifically.

## P2 — App architecture & hosting

Below the music work by decision (2026-08-14): the product is the music, and a
better-hosted player does not make a loop sound less like the last loop.

- [ ] **Split the web app into its own deployable folder.** Composition happens
      through Claude in the repo; the app only needs to *play and export*. Carve
      `src/app` (+ its entry/HTML/build config) into a self-contained package so
      it deploys without the generation toolchain (`scripts/`, palette loader,
      `src/engine`'s authoring path) riding along.
- [ ] **Migrate the app to React.** Adopt a practical `components/` `hooks/`
      `helpers/` layout inside the app package. Keep audio glue thin — engine
      logic still belongs in `src/engine`/`src/utils` with tests.
- [ ] **Host on Cloudflare.** Deploy the split app (Pages/Workers) so it's usable
      from a phone, not just `npm run dev` on the desktop.

## P3 — Depth & polish

- [ ] **MP3 export.** Optional, on top of WAV, if user wants smaller/shareable
      files (ffmpeg.wasm or a script). WAV is the default per decision.
- [ ] **Semantic palette search.** If tag matching gets weak, add local
      embeddings (sqlite + a small model) so freeform prose maps to palettes.
      Defer until keyword match visibly fails — YAGNI gate.
- [ ] **Waveform / piano-roll preview** in the bench for quick visual feedback.
- [ ] **Record a built piece's source plan.** A composition expanded by
      `song:build` keeps no pointer back to `plans/<name>.json`, so knowing which
      file to edit and rebuild is tribal knowledge. Add a `source` field, written
      by the builder.
- [ ] **`compositions:list` CLI** (`--kind`, `--tag`, `--motif`). `library.ts`
      already has the search/index functions and the bench uses them; the terminal
      can't, so Claude greps JSON to answer "what have we written for this
      campaign".
- [ ] **`docs/` progressive-disclosure set**: `composition-spec.md`,
      `lofi-chain.md` — split out of README as they grow.
- [ ] **Better lo-fi chain.** Sidechain/ducking, tape stop, and tuned defaults so
      exports sound intentional. Swing, per-step accents, per-track signal chains
      and seeded humanize all ship now; what is left is the *mix bus*.
- [ ] **In-app song-idea submission.** Let the user type a text prompt/idea in the
      hosted app and have it persist somewhere free and low-friction (e.g. a
      Cloudflare KV/D1 binding, or an issue/gist write) for Claude to pick up and
      compose from later. Depends on the Cloudflare host.
- [ ] **Melody quality passes.** Motif repetition, tension/resolution, phrase
      contour rules so generated tunes feel composed, not random.

## P4 — Speculative

- [ ] **MIDI export** (`@tonejs/midi`) so pieces open in a DAW.
- [ ] **Loudness normalize** exports to a target LUFS.
- [ ] **Palette "temperature"** — user dial for how adventurous the generation is.
- [ ] **Scene presets for D&D** — one-word triggers ("ambush", "tavern", "boss")
      that bundle palette + tempo + section shape.

---

## Guiding checks (every addition)

- New pure logic → lives in `engine`/`utils` with a `*.test.ts`.
- New markdown → frontmatter.
- New repeatable chore → a `scripts/` npm command, named flags only.
- `npm test` + `npm run typecheck` stay green.
