---
title: Progress & Roadmap
purpose: Prioritized backlog of what to build. Living doc — check items off, reorder as reality shifts.
audience: [claude, human]
updated: 2026-08-14
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

**Decision, 2026-08-15: the shelf comes before the songs.** `compositions/` was
emptied on 2026-08-14 — the first library was written to find out what the tools
could do, and it found out. The materials are what decide whether the *next*
piece is rich or is the last piece again, so they get built first, deliberately,
while nothing is depending on them.

What we learned about composing is not lost, it is parked: it lives in
[`docs/variety.md`](./docs/variety.md) — the knobs, the rules for choosing them,
and the engine gaps found the hard way. Read it before writing a plan. The
composition *work* is P1 and below until the shelf can carry it.

The shelf today: `lead/` 9, `pad/` `pluck/` `bass/` `drums/` 4 each, and
**`piano/` and `epiano/` one apiece**. The loop for all of it is fork → edit →
render probe → audition at `/voices.html` → approve with a `--summary`; approved
voices are **forked, never edited**. See [`docs/voices.md`](./docs/voices.md).

- [~] **The keys family — awaiting audition.** `piano/` and `epiano/` had one
      voice each, and both **predated `body`/`breath`/`vibrato` existing**: they
      are an oscillator and an envelope with no box around them, which is why
      every hand-written melody in the first library sounded synthetic. Four
      drafts are written and their probes rendered — audition at `/voices.html`
      (drafts only) and approve each with a `--summary`:
  - `piano/felt-hammer` — felt strip over the strings; 12 ms attack, a −5 dB
    notch where the hammer hill would be, mechanism noise at 900 Hz.
  - `piano/music-box` — FM at a 3.5:1 *inharmonic* ratio, sustain 0, no low end
    at all. The lullaby/doll's-house/villain voice.
  - `epiano/wurlitzer-reed` — the reed against `fm-rhodes`'s tine: harmonicity 1
    instead of 2, index 11, scooped middle. Soul and blues.
  - `epiano/clav-comb` — subtractive, not FM; 0.25 s release, the shortest on the
    shelf. The only keys voice that is a *rhythm* instrument.
- [ ] **`melody` is still hard-routed to the piano track** (`build-song.ts`), so
      the keys voices above are the only thing a written top line can ever be.
      Open question, not yet decided: let a plan route `melody` to another
      instrument the way `voices` already routes tone — the shelf has
      `lead/lone-whistle`, `lead/harmonica-reed` and `lead/soprano-wordless`
      doing nothing for melodies. Engine change, so it sits behind the shelf work.
- [ ] **Non-metal `bass/` and `pluck/`.** Four each, but the character is
      electric-and-distorted throughout: the acoustic and clean end is one voice
      wide (`upright-pizz`, `nylon-arpeggio`). Anything folk, jazz, lo-fi or
      chamber has nothing to be played on.
- [ ] **Kits, continued.** Four now — `house-kit` (neutral), `frontier-kit`
      (western punctuation), `slab-kit` (rock backbeat), `brush-kit` (quiet,
      ride-led). Still missing the electronic end (`house`, `techno`, `dnb`,
      `trap` all want a machine, not a room) and orchestral percussion
      (taiko/timpani/gran cassa) for the cinematic palettes.
- [ ] **Two voices separated only by EQ will converge.** `docs/voices.md` says
      this and `pad/string-bed` vs `pad/mens-choir` proved it. Every voice added
      from here has to differ in `breath`, `tremolo`, `section` or time — not in
      a few dB of `body`. Worth a pass over the existing shelf to find the pairs
      that are already too close to be worth choosing between.

## P1 — Make the core loop *good*

Composition work. The knowledge behind these items is in
[`docs/variety.md`](./docs/variety.md).

- [ ] **The prompt should drive the knobs.** The end state is that the user's
      scene words *choose*: figure, tempo band, register, mode, section arc, kit.
      Today Claude picks by feel, which is why variety.md is a checklist rather
      than code. Write the mapping down (a `docs/` note or a palette field) so it
      is repeatable, and check a new piece against the shelf before writing it.
- [ ] **The `compose` path can't reach the knobs.** Figures, register and the
      split-bar harmony live in `figure.ts`/`build-song.ts`, so they exist for
      plan-built **loops** only. `npm run compose` builds segments through
      `composer.ts` + `parts.ts`, which never import `figure.ts` — so the fast
      path, the one used for a D&D scene on the fly, still has exactly one rhythm
      vocabulary. Either `parts.ts`'s pattern strings become figures, or the
      composer picks a figure per section the way a plan does.
- [ ] **Harmony beyond the Andalusian minor.** i–VII–VI–V with a harmonic-minor V
      is the only progression the first library ever reached for. Want: Dorian
      (natural VI), a Phrygian bII drone, pedal-point harmony that refuses to
      move, and major-key westerns. Overlaps the mode work below —
      phrygian-dominant is still unsupported (`MODE_FAMILY` is the seven church
      modes only), and it is the mode this genre most wants.

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
      `blues`, `cinematic`, `spaghetti-western`, `reggae`, `folk`, `flamenco` —
      all now carrying a `groove:`. What's left is authoring time, or the meter
      unlock below.
  - [ ] **Authorable today** (identity carried by harmony/tempo/chord-rhythm):
        `soul`, `gospel`, `post-rock`, `minimalism`, `baroque`, `ragtime`,
        `bossa`, `synthwave`, `city-pop`, `shoegaze`, `doom`.
  - [ ] **Authorable now that grooves ship** (their identity *is* the kit
        pattern, so each is a `groove:` block plus prose): `house`, `techno`,
        `dnb`, `jungle`, `breakbeat`, `disco`, `punk`, `trap`, `afrobeat`,
        `samba`, `garage`. `hiphop` is half-covered by `lofi`.
  - [ ] **Gated on meter**: `waltz`, `celtic` jigs, gospel shuffle, doo-wop.
  - [ ] **Authorable now that modes ship** (state the mode in frontmatter —
        `mode: dorian` — instead of describing it in prose): `celtic`
        (mixolydian), `medieval` (dorian/mixolydian). `klezmer` wants
        phrygian-dominant, which is a harmonic-minor mode and still unsupported —
        `MODE_FAMILY` covers the seven church modes only. Emotion palettes
        can take a modal `scale` too — none does yet, and until one does a modal
        genre only gets its colour from the numerals it writes.

- [ ] **Meter support beyond 4/4.** `src/utils/timing.ts` is 4/4-only by
      construction ("Pure timing math for 4/4 music"). Add a time signature to
      the composition spec and thread it through timing + arrange. Unlocks the
      3/4, 6/8 and 12/8 genres above, and waltz/jig cues for D&D. Pure logic —
      testable.

- [ ] **Timbre breadth.** `tape` ships; still to author: `felt-piano`, `rhodes`,
      `nylon-guitar`, `strings`, `choir`, `music-box`, `808`, `pipe-organ`.
- [ ] **Blend depth.** v1 maps a timbre only to two coarse voices (`padVoice`/
      `leadVoice`, piano>epiano>pluck) + lo-fi nudges — a guitar timbre still leads
      on piano (reproducer: `--palette battle --with metal,brown-sound` resolves
      to piano/pad). Make voice selection honor timbre intent. (Genre feel now
      shapes rhythm via `groove:` — the kit, the bass pattern and the chord
      rhythm all read off it; what's left here is voices.) **Note:** `mode` is
      declared in the genre schema and read by *nothing* — `grep mode
      src/engine/blend.ts` is empty. Every genre palette declares it inertly.

- [ ] **Mode-crossed blends: melody vs harmony.** `theory.ts` resolves numerals as
      written and the composer now picks a progression in the key's own idiom
      (`progressionsInIdiom`), which removed every Picardy tonic — a minor emotion
      no longer opens on a major chord. What's left is the other direction: a
      *major* emotion under a minor-only genre. 12 of 81 emotion×genre pairs
      (`calm`/`epic`/`happy`/`hopeful` × `funk`/`metal`/`spaghetti-western`),
      where the genre has no major idiom to fall back to and honestly shouldn't.
      There the chords go minor while `composer.ts:melodyFor` still draws its
      ladder from `scaleLadder(tonic, dir.scale)` — the *emotion's* major scale —
      so an A natural rubs against an Ab. **Narrower than it was:** the melody
      now re-anchors to a chord tone on every bar, so the clash is confined to
      the motif's passing notes instead of running through the whole line. What's
      left: have `blend` warn when a genre's `mode` contradicts the emotion's
      scale (the honest job for the inert `mode` field above).
- [ ] **Drums, remaining work.** The kit, the `groove:` step notation and the
      blend rule shipped (see `docs/grooves.md`). Left over:
  - [ ] Author grooves for the genres that still have none — `ambient` is
        deliberately drumless, but every genre added from here needs one.
  - [ ] Fills. A groove states one bar and repeats it; nothing marks the end of
        an eight-bar phrase, which is what makes a long loop read as a machine.
  - [ ] Sampled kit via `smplr`. Synth drums audition instantly and sound it.

- [ ] **Promote `build-song.ts`'s section builders to `src/engine/sections.ts`.**
      ~390 lines — the largest and most musical file in the repo — living in a
      script with no test, against this repo's own promote-&-test rule. The six
      `Style` builders are pure functions of (chords, startBar) and want a
      `*.test.ts`. Note they are metal/western-specific (gallop, power chords,
      tolling bell), so this is a promotion, not a generalisation. Prereq for
      "Song sections" below.

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
      Tune the defaults so exports sound intentional. Swing ships (per groove),
      and accent characters give parts step-level dynamics; **micro-timing
      humanize does not** — every note still lands exactly on its (possibly
      swung) grid position, and two notes on the same accent char are bit-identical
      in velocity. That's the other half of why a render reads as programmed.
      Wants a seeded `engine/humanize.ts`, pure and testable.
- [ ] **Song sections.** `compose` now writes statement / restatement /
      resolution, which is a form but not an arrangement. Grow to intro / A / B /
      outro with repeats, so "sample" can become a short piece on demand. The
      restatement currently varies by arrangement only (added arp, louder kit,
      inverted motif) — B wants different *harmony*.
- [ ] **Sampled instruments via `smplr`.** Swap synth piano/pad for real samples
      (SoundFonts in `assets/samples/`) behind the same instrument interface.

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
      `palette-authoring.md`, `lofi-chain.md` — split out of README as they grow.
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
