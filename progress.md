---
title: Progress & Roadmap
purpose: Prioritized backlog of what to build. Living doc — check items off, reorder as reality shifts.
audience: [claude, human]
updated: 2026-08-13
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

## P0 — App architecture & hosting

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

## P1 — Make the core loop *good*

- [ ] **New palette kinds (structure).** Both validate against the permissive
      generic schema — a folder + prose, no code change.
  - [ ] `palettes/space/` — acoustic environment (`cathedral`, `cave`,
        `tavern`, `open-field`), carrying `signal` hints.
  - [ ] `palettes/era/` — period lean on instrumentation + harmony
        (`medieval`, `baroque`, `eighties`).

- [ ] **Emotion breadth — the low-arousal hole.** The set still skews
      high-arousal (battle, epic, angry, tense, mysterious, happy). The D&D loop
      spends more time on downtime than on combat. `calm` ships; still to author:
      `romantic` (love, tender), `lonely` (isolation, desolate, cold),
      `nostalgic` (memory, wistful, faded), `solemn` (sacred, funeral, ritual),
      `whimsical` (comic, bouncy).

- [ ] **Genre breadth.** Shipped: `funk`, `jazz`, `lofi`, `metal`, `ambient`,
      `blues`, `cinematic`, `spaghetti-western`, `reggae` — all now carrying a
      `groove:`. What's left is authoring time or the two engine unlocks below.
  - [ ] **Authorable today** (identity carried by harmony/tempo/chord-rhythm):
        `soul`, `gospel`, `post-rock`, `minimalism`, `baroque`, `ragtime`,
        `bossa`, `synthwave`, `city-pop`, `shoegaze`, `doom`.
  - [ ] **Authorable now that grooves ship** (their identity *is* the kit
        pattern, so each is a `groove:` block plus prose): `house`, `techno`,
        `dnb`, `jungle`, `breakbeat`, `disco`, `punk`, `trap`, `afrobeat`,
        `samba`, `garage`. `hiphop` is half-covered by `lofi`.
  - [ ] **Gated on meter**: `waltz`, `celtic` jigs, gospel shuffle, doo-wop.
  - [ ] **Gated on modes**: `folk` (dorian), `flamenco` (phrygian), `celtic`
        (mixolydian), `klezmer`, `medieval`.

- [ ] **Meter support beyond 4/4.** `src/utils/timing.ts` is 4/4-only by
      construction ("Pure timing math for 4/4 music"). Add a time signature to
      the composition spec and thread it through timing + arrange. Unlocks the
      3/4, 6/8 and 12/8 genres above, and waltz/jig cues for D&D. Pure logic —
      testable.

- [ ] **Modal harmony.** `theory.ts:diatonicTriads` throws on anything but
      major/minor, and the genre `mode` enum is `major|minor|either`, so every
      modal genre has to fake it in prose (per `docs/palette-authoring.md`).
      Widen both to the church modes (dorian, phrygian, lydian, mixolydian,
      aeolian). Unlocks the modal genres above and gives emotion palettes real
      color. Pure logic — testable.

- [ ] **Timbre breadth.** `tape` ships; still to author: `felt-piano`, `rhodes`,
      `nylon-guitar`, `strings`, `choir`, `music-box`, `808`, `pipe-organ`.
- [ ] **Blend depth.** v1 maps a timbre only to two coarse voices (`padVoice`/
      `leadVoice`, piano>epiano>pluck) + lo-fi nudges — a guitar timbre still leads
      on piano (reproducer: `--palette battle --with metal,brown-sound` resolves
      to piano/pad). Make voice selection honor timbre intent. (Genre feel now
      shapes rhythm via `groove:`; what's left here is voices.) **Note:** `mode` is
      declared in the genre schema and read by *nothing* — `grep mode
      src/engine/blend.ts` is empty. Every genre palette declares it inertly.

- [ ] **Mode-crossed blends: melody vs harmony.** `theory.ts` resolves numerals as
      written and the composer now picks a progression in the key's own idiom
      (`progressionsInIdiom`), which removed every Picardy tonic — a minor emotion
      no longer opens on a major chord. What's left is the other direction: a
      *major* emotion under a minor-only genre. 12 of 81 emotion×genre pairs
      (`calm`/`epic`/`happy`/`hopeful` × `funk`/`metal`/`spaghetti-western`),
      where the genre has no major idiom to fall back to and honestly shouldn't.
      There the chords go minor while `composer.ts:63` still draws the melodic
      ladder from `scaleNotes(tonic, dir.scale)` — the *emotion's* major scale —
      so an A natural rubs against an Ab. Pick one: derive the ladder from the
      resolved chords, or have `blend` warn when a genre's `mode` contradicts the
      emotion's scale (the honest job for the inert `mode` field above).
- [ ] **Drums, remaining work.** The kit, the `groove:` step notation and the
      blend rule shipped (see `docs/grooves.md`). Left over:
  - [ ] Author grooves for the genres that still have none — `ambient` is
        deliberately drumless, but every genre added from here needs one.
  - [ ] Fills. A groove states one bar and repeats it; nothing marks the end of
        an eight-bar phrase, which is what makes a long loop read as a machine.
  - [ ] Sampled kit via `smplr`. Synth drums audition instantly and sound it.

- [ ] **`compose` can't reach the good machinery.** `riff.ts` + `build-song.ts`
      write real parts (gallops, tremolo, approach notes); `composer.ts` writes a
      pad root, a block triad on the downbeat and two random-walk quarter notes —
      every bar, ~5 bars, no bass. `npm run compose` is the advertised fast path
      and it is the weakest generator in the repo. Share the builders: composer
      emits bass/rhythm layers through the same primitives the plans use.

- [ ] **Promote `build-song.ts`'s section builders to `src/engine/sections.ts`.**
      397 lines — the largest and most musical file in the repo — living in a
      script with no test, against this repo's own promote-&-test rule. The six
      `Style` builders are pure functions of (chords, startBar) and want a
      `*.test.ts`. Prereq for "Song sections" below.

- [ ] **Voice leading.** `theory.ts:chordPitches` always voices root-position
      ascending from a fixed octave, so consecutive chords leap instead of moving
      by common tone. A nearest-inversion pass is small, pure, testable, and
      audible on every piece the composer writes.

- [ ] **Timbre `signal` → real audio nodes.** `blend.ts:deriveLofi` regex-matches
      the chain into four lo-fi numbers and stops; `graph.ts` builds one shared
      lowpass→reverb for the whole mix. So `fuzz`, `plate-reverb` and
      `amp-cabinet` are prose. Map signal tokens to Tone node factories, and give
      tracks their own fx/pan instead of a single summed chain. Pairs with
      "Blend depth" above (voices) — this is the other half (sound).

- [ ] **Leitmotif quoting is metadata-only.** `motifs:` gets a chip in the bench
      and a dangling-link check; nothing transposes a theme into a host piece's
      key and tempo. `docs/library.md` promises "written once, quoted wherever the
      character shows up" — that needs a pure `quoteMotif(motif, key, atBar)` in
      the engine, else the field is a label.
- [ ] **Better lo-fi chain.** Sidechain/ducking, bitcrush option, tape stop.
      Tune the defaults so exports sound intentional. Swing ships (per groove);
      **humanize does not** — every note in every track is still dead on the
      grid at a fixed velocity, which is the other half of why a render reads as
      programmed. Wants a seeded `engine/humanize.ts`, pure and testable.
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
- [ ] **Record a built piece's source plan.** A composition expanded by
      `song:build` keeps no pointer back to `plans/<name>.json`, so knowing which
      file to edit and rebuild is tribal knowledge. Add a `source` field, written
      by the builder.
- [ ] **`compositions:list` CLI** (`--kind`, `--tag`, `--motif`). `library.ts`
      already has the search/index functions and the bench uses them; the terminal
      can't, so Claude greps JSON to answer "what have we written for this
      campaign".
- [ ] **`docs/` progressive-disclosure set**: `composition-spec.md`,
      `palette-authoring.md`, `lofi-chain.md` — split out of README as they grow.
- [ ] **In-app song-idea submission.** Let the user type a text prompt/idea in the
      hosted app and have it persist somewhere free and low-friction (e.g. a
      Cloudflare KV/D1 binding, or an issue/gist write) for Claude to pick up and
      compose from later. Depends on the Cloudflare host.
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
