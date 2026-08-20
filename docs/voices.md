---
title: Voices — designing instrument sounds
purpose: The loop for introducing, refining and approving an instrument sound, and how an approved voice gets used in songs.
audience: [claude, human]
updated: 2026-08-15
read_order: 5
see_also: [../readme.md, ../claude.md, rendering.md, ../voices/archive.md]
---

# Voices

A composition says *what* is played. A **voice** says what it sounds like:
`voices/<instrument>/<slug>.json`, one file per sound, several per instrument.

They are separate because they change on different clocks. A piece is written
once and edited constantly; "our bass tone" is decided once, carefully, and then
every piece after it inherits that decision. Splitting them means you can settle
the materials on their own — which is much cheaper than discovering halfway
through a song that the lead was wrong all along.

```bash
npm run voice:find -- --query "round sub bass"     # what is already here
npm run voice:new -- --instrument bass --slug sub-drone --title "Sub drone"
npm run voice:render -- --voice bass/sub-drone
npm run dev                    # → /voices.html → Play / Pause / Approve
npm run voice:approve -- --voice bass/sub-drone --summary "<one line>" --default
```

## The loop

0. **Find the parent.** `npm run voice:find -- --query "<what you want>"`, then
   `--brief <id>` on the closest hit. The brief is the fork chain plus that
   voice's design notes, which is what the fork is written against — reaching
   for numbers before reading it is how you re-derive a decision someone
   already made and wrote down.
1. **Fork.** `npm run voice:new -- --from bass/saw-round --slug sub-drone`.
   Always a fork, never a blank file — a preset built from nothing sounds like
   nothing, and the fastest route to a new tone is two knobs off one that
   already works. With `--instrument` instead of `--from`, it copies that
   instrument's current default. The copy lands in `draft`, with `forkedFrom`
   recording where it came from, and **without the parent's `summary`** — the
   line saying which voice to pick cannot be inherited.
2. **Edit the JSON.** Envelopes, oscillators, the amp blocks, the kit's tuning
   and levels. The shape (and what each field is *for*) is
   [`src/engine/voice.ts`](../src/engine/voice.ts). What each field *sounds*
   like is written up in the seeded voices' `notes` — read them with `--brief`,
   one voice at a time, rather than opening JSONs to browse.
3. **Render its probe.** `npm run voice:render -- --voice bass/sub-drone --force`.
   The `--force` is not optional after an edit: the audio has no idea the JSON
   moved. Roughly 25 seconds of audio per voice, a couple of minutes of
   rendering for a guitar.
4. **Listen.** `npm run dev` → [`/voices.html`](../voices.html). Tabs are
   instruments, so you see one instrument's sounds at a time; "drafts only"
   narrows it to what you are working on. Play, **Pause** and Resume — judging a
   tone means hearing the same phrase again, not restarting from the top.
5. **Refine** — back to 2 — or **approve**: the ✓ button, or
   `npm run voice:approve -- --voice bass/sub-drone --summary "<one line>"`.
   The summary is this voice's archive row — when to pick it over its
   neighbours, 140 characters, enforced. `--notes` is the other half: why it is
   built this way, any length, and it stays in the file. Add `--default` to
   make it what `bass` tracks get when they name no voice.
6. **Approved voices are frozen by agreement.** To change one, fork it again.
   That keeps a song that names a voice sounding like it did, and it is how an
   instrument accumulates several sounds worth choosing between instead of one
   sound with a history only git can see.

## Making a voice sound acoustic

An oscillator into a filter into an envelope is a *synth*, and tuning it harder
does not make it an instrument — the cues the ear uses to tell the two apart are
not expressible in those fields at all. Three optional blocks are, and they are
what an acoustic voice needs before anything else is worth adjusting:

| Block | What it is | Why a filter and an envelope can't do it |
|---|---|---|
| `vibrato` | Pitch movement — `rate`, `depth`, `drift`. | An envelope shapes level, not pitch. Perfectly stationary pitch is the loudest synth tell there is, and a *perfectly regular* vibrato is the second. `drift` wanders the width so it is neither. |
| `body` | Up to four fixed resonances (`frequency`/`q`/`gain`). | The preset's filter envelope **tracks the note**; a resonating box does the opposite and stays where it is, so a scale walks through the resonances and changes colour unevenly. That unevenness is what a physical object sounds like. |
| `breath` | Bandpassed noise, gated by the instrument's own envelope follower. | It is a second sound source, and an inharmonic one. Bow scrape, reed hiss, the plectrum click — every acoustic onset has some, and no waveform contains any. |
| `tremolo` | Re-bowing — `rate`, `depth`, `spread`. | An articulation, not an effect: one written note played as several strokes. Sits before `body`/`breath`, so each stroke gets its own scrape. |

They cost nothing when omitted: a preset without them builds exactly the graph it
built before they existed. `vibrato` is one node for the whole track rather than
per note, because a `PolySynth` exposes no per-voice pitch input — right for one
player, and the reason there is no delayed vibrato onset. For more than one
player, see below.

Order is the modelling: synth → vibrato → tremolo → body → breath → amp. The
string moves, its pitch is not still, the bow may be reversing several times a
second, the box it is mounted on rings, the player adds noise the box never made,
and only then does any of it reach an amplifier.

**Two voices separated only by EQ will converge.** Bandwidth is the first thing
the lo-fi chain takes away, so a ±5 dB difference in `body` is not a difference
in instrument — `pad/string-bed` and `pad/mens-choir` were built that way and
were not tellable apart. Fixes, in ascending order of reliability: state the
resonances loudly (and prefer a deep **notch** — contrast comes from absence as
much as presence, and a hole costs no headroom); change `breath`, since a slow
follower is a swell and a fast one is a scrape; and separate them in *time* with
`tremolo`, which no amount of filtering erodes.

```bash
npm run voice:check                                          # the whole shelf
npm run voice:check -- --instrument pluck --drafts           # while designing a fork
npm run voice:check -- --explain pluck/brown-rhythm,pluck/chainsaw-chug
```

That rule is easy to restate and hard to *apply*, because applying it means
holding every pair of an instrument in your head at once — nine voices is
thirty-six pairs — and knowing which of forty numbers matter.
`voice:check` does the holding. Two things have to be true for a difference to
count, and the second is the one that gets forgotten: it has to be on an axis
the chain doesn't erode, **and it has to be big enough to hear**. A fork changes
forty numbers, so `sustain: 0.9 → 0.85` is not a separation, and a check that
counts it clears every pair and therefore finds nothing.

So the rules live in [`src/engine/voice-distance.ts`](../src/engine/voice-distance.ts),
pure and tested: `body` and the amp's tone stack are *weak* (eroded) however
large; envelopes, breath, tremolo, section and the kit's decays are judged by
**ratio**, because hearing is logarithmic — 20 ms against 30 is the same size of
change as 200 against 300; tuned drums are judged in semitones; a different
waveform always counts; `maxPolyphony` never does, being a render budget rather
than a sound. `--explain` prints one pair's every difference with the audible
ones marked, which is the view you want mid-fork.

It is a nudge, not a gate — the same standing as `song:build`'s defaults report.
It cannot hear a −6 dB notch, and a deep enough one is a real separation this
page recommends. What it can do is tell you which two probes to open.

## Making a voice sound like many players

A section is not a solo voice turned up, and it is not a detuned oscillator stack
either. A `fat` oscillator gives one player several pitches sharing **one**
envelope, **one** filter sweep, **one** vibrato phase and **one** instant of
attack — enormous and audibly singular, which is what every synth string patch
sounds like. What the ear counts players by is *decorrelation*, and the optional
`section` block is the only thing in a preset that produces any:

```json
"section": { "players": 6, "detune": 14, "timing": 0.035, "seats": 0.55 }
```

It builds `players` copies of the entire voice — synth, vibrato, body, breath —
varies each one, and sums them. `detune` is the intonation spread in cents,
dealt evenly and then reseated at random (dealt in seat order it is a pitch ramp
across the stereo image). `timing` is the attack smear in seconds, one-sided so
nobody plays *early*: the written time is the leader and the rest land inside the
window, which widens the onset without dragging the section behind the drums.
`seats` is the stereo width; `vibratoVary`, `bodyVary` and `effortVary` scatter
each player's hand, box and bow pressure. Who differs by how much is decided in
[`src/engine/section.ts`](../src/engine/section.ts), pure and seeded from the
voice's slug, so a re-render never reshuffles who was sharp.

Two things follow from this and are not optional:

- **Drop the fat oscillator.** The spread now lives between real players; paying
  for it again inside each one is triple the oscillator cost for thickness that
  is already there.
- **Budget the polyphony.** Cost is linear in players — six players at polyphony
  3 is 18 running voices, the dominant render expense per
  [`rendering.md`](./rendering.md). Auditions cap the desk at three players
  (`quality.ts`), which is enough to still hear a section.

`voices/lead/string-section.json` and `voices/pad/string-bed.json` are the worked
examples, `voices/pad/string-tremolo.json` adds re-bowing on top, and
`pad/mens-choir` is the same idea before the block existed — worth reading side
by side.

A section also varies each player's `tremolo` rate (at double `vibratoVary`,
because bow speed is a shared intention rather than a constant of the hand).
Without that, every player turns the bow at the same instant and the section is
one tremolo pedal.

## The probe

Every voice of an instrument is auditioned on the **same étude** — that is the
only way two sounds can be compared, because a different riff makes you judge the
riff. The études live in [`src/engine/probe.ts`](../src/engine/probe.ts) and each
deliberately asks the questions a tone has to answer: attack, sustain and
release, the same gesture in two registers, the same phrase soft and hard, and
one passage dense enough to turn a thick voice to porridge.

A probe is one track, played through the **default lo-fi chain** a composition
gets when it says nothing. Both are on purpose: you are judging a sound, not a
mix, but you are judging it as it will actually be heard rather than in a drier,
brighter version of the world.

A preset can name a different étude with `"probe": "lead"` — useful when a `pad`
voice is really a synth lead.

## Using a voice in a song

```json
{ "instrument": "lead", "voice": "molten", "notes": [] }
```

Omit `voice` and the track gets the instrument's default, in this order: the one
flagged `default`, else the first approved one, else the first one there is. That
ordering is what lets you add a draft without silently changing how every
existing song renders.

**Search first, browse second.**

```bash
npm run voice:find -- --query "dusty spaghetti western standoff"
npm run voice:find -- --instrument lead --tags spaghetti-western
npm run voice:find -- --brief pad/string-bed        # the fork brief, not a pick
```

| Flag | Does |
|---|---|
| `--query <text>` | Free text. Terms are alternatives; a tag or slug hit scores double a mention in the prose, and more hits rank higher. A scene sentence beats one keyword. |
| `--instrument <name>` | One instrument only. |
| `--tags <a,b,c>` | Voice must carry **every** tag listed. Narrows; does not rank. |
| `--drafts` | Include what has not been approved. Off by default. |
| `--limit <n>` | Rows to print, default 12. |
| `--brief <id>` | Instead of a list: one voice's fork chain and design notes. |

It reads `voices/` directly, so it cannot be stale between an edit and a
re-approve the way a generated file can.

[`voices/archive.md`](../voices/archive.md) is the same index unfiltered —
generated on every approval, one row per approved sound, plus the fork trees.
Read it when you want the whole shelf; search when you want four rows.

### Why the archive is an index and not the design record

A voice carries two pieces of prose, and they are read at different times:

| Field | Answers | Read | Capped |
|---|---|---|---|
| `summary` | Which voice do I pick? | Every song, for every voice | 140 chars |
| `notes` | Why is it built this way? | Once, for the one voice you are forking | No |

The archive prints only `summary`. That is the whole reason it stays a file you
can read on every request: the design notes are the interesting half, but they
are the *fork brief*, and carrying forty of them made choosing a sound cost more
context than writing the piece. They live in the JSON, one click from the row.

So: picking a voice is a read of `archive.md`. Forking one is a read of that
voice's `notes` field — and of its parent's, which the **Lineage** tree at the
foot of the archive points to. The 140-character cap is enforced by
`validateVoice`, because an uncapped summary becomes a second `notes` within a
year and the archive is back where it started.

## Files

| Path | Role |
|---|---|
| `voices/<instrument>/<slug>.json` | A voice. Folder is the instrument, filename is the slug. |
| `voices/archive.md` | Generated index of approved voices — one row each, plus the fork trees. Never hand-edit; re-approve instead. |
| `src/engine/voice.ts` | Preset shape + validation — tested. |
| `src/engine/section.ts` | Who plays how far off, for a `section` voice — pure, seeded, tested. |
| `src/engine/voice-library.ts` | Filing, default resolution, approve/fork rules, archive markdown — tested. |
| `src/engine/voice-distance.ts` | Which differences between two voices survive the lo-fi chain — pure, tested. |
| `src/engine/probe.ts` | The études — tested. |
| `src/app/audio/instruments.ts`, `drums.ts` | Preset → Tone nodes. The amp's block order lives here, because that is the instrument. |
| `src/app/voices.ts` | The bundled registry the graph resolves against. |
| `src/dev/voice-store.ts`, `voice-ops.ts`, `voice-api.ts` | Reading/writing `voices/`, the three operations, and the bench's buttons. |
| `scripts/new-voice.ts`, `render-voices.ts`, `approve-voice.ts` | The three commands that change files. |
| `scripts/find-voice.ts` | `voice:find` — the read-only one: search the shelf, or print one fork brief. |
| `scripts/check-voices.ts` | `voice:check` — the other read-only one: which pairs will converge. |
| `public/audio/voices/` | Rendered probes + their manifest. What the bench plays. |

## Traps

- **A voice you edited sounds like its old self until you re-render it.** Same
  rule as compositions, same fix: `--force`. The bench prints the render date
  under Play so a stale audition is visible rather than mysterious.
- **Two defaults for one instrument is not a schema error** — each file is valid
  alone — so `--default` demotes the incumbent in the same call, and
  `npm test` fails if two ever coexist.
- **A `section` voice costs `players × maxPolyphony` voices.** It is the one
  block that multiplies render time rather than adding to it, so lower the
  per-player polyphony when you raise the player count — a section plays a line,
  not six independent parts.
- **The kit's levels belong to the voice, not the groove.** A pattern says where
  the hits are; how loud a hat sits under a kick is a property of the kit.
- **Weight goes after the drive, never into it.** `tighten` is a high-pass
  *before* the preamp and `toneStack.low` is a shelf *after* it, so "more bass"
  and "less mush" are the same edit rather than opposing ones: raise `tighten`
  and raise the low shelf. Low end that reaches a drive stage does not come out
  as low end — several notes at once intermodulate into sum and difference tones
  that are in neither the chord nor the key, which is why a voice can sound fine
  on a single line and turn to porridge on a block chord. A `body` notch around
  300 Hz cleans up what is left, and costs no headroom.
- **A voice whose real texture is chords must audition on a chordal étude.** The
  probe is the only thing anyone hears before approving, so a keyboard filed
  under `lead` (for the `amp` block) auditioning on the single-line `lead` étude
  cannot be judged at all — the failure it has is one that only appears when
  five notes hit the same drive. Set `"probe": "keys"` on the preset *before* the
  first render. Same rule in the direction [the probe section](#the-probe) states
  it: match the étude to the part, not to the folder.
- **Deleting a voice a song names** leaves that song unrenderable with a clear
  error rather than a silent substitution — see `voiceFor` in
  [`src/app/voices.ts`](../src/app/voices.ts). A wrong sound that renders anyway
  is the expensive failure: you find it twelve minutes later, by ear.
