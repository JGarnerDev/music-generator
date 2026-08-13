---
title: Progress & Roadmap
purpose: Prioritized backlog of what to build. Living doc — check items off, reorder as reality shifts.
audience: [claude, human]
updated: 2026-08-12
read_order: 2
see_also: [readme.md, docs/vision.md]
status: living
---

# Progress & Roadmap

Ordered by priority. **P0** = foundation is incomplete without it. **P1** = makes
the core loop good. **P2** = depth/polish. **P3** = nice-to-have / speculative.

Legend: `[ ]` todo · `[~]` in progress. **Delete an item once it's done** — this
doc is the *remaining* backlog, not a changelog. Git history is the record of what
shipped; keep this list short and forward-looking.

## P1 — Make the core loop *good*

- [ ] **Genre & timbre breadth.** The blend resolver ships
      (`src/engine/blend.ts`, `compose --with`); now feed it. Only seed exemplars
      exist (`jazz`, `funk`; `analog-synth`, `brown-sound`). Author the genres/
      timbres it will lean on: `rock`, `hiphop`, `ambient`, `cinematic`; more
      signature timbres.
- [ ] **Blend depth.** v1 maps a timbre only to two coarse voices (`padVoice`/
      `leadVoice`, piano>epiano>pluck) + lo-fi nudges — a guitar timbre still leads
      on piano. Make voice selection honor timbre intent, and let genre `mode`/feel
      shape rhythm, not just tempo/progressions.
- [ ] **Drums / percussion track.** Lo-fi kit (kick/snare/hat) — a beat is what
      sells lo-fi. Needs an instrument type + pattern notation in the spec.
- [ ] **Better lo-fi chain.** Sidechain/ducking, bitcrush option, tape stop,
      swing/humanize on timing. Tune the defaults so exports sound intentional.
- [ ] **Song sections.** Grow past one 4-bar loop: intro / A / B / outro with
      repeats, so "sample" can become a short arrangement on demand.
- [ ] **Sampled instruments via `smplr`.** Swap synth piano/pad for real samples
      (SoundFonts in `assets/samples/`) behind the same instrument interface.

## P2 — Depth & polish

- [ ] **MP3 export.** Optional, on top of WAV, if user wants smaller/shareable
      files (ffmpeg.wasm or a script). WAV is the default per decision.
- [ ] **Semantic palette search.** If tag matching gets weak, add local
      embeddings (sqlite + a small model) so freeform prose maps to palettes.
      Defer until keyword match visibly fails — YAGNI gate.
- [ ] **Waveform / piano-roll preview** in the bench for quick visual feedback.
- [ ] **`docs/` progressive-disclosure set**: `composition-spec.md`,
      `palette-authoring.md`, `lofi-chain.md` — split out of README as they grow.
- [ ] **Melody quality passes.** Motif repetition, tension/resolution, phrase
      contour rules so generated tunes feel composed, not random.

## P3 — Speculative

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
