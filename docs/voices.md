---
title: Voices — designing instrument sounds
purpose: The loop for introducing, refining and approving an instrument sound, and how an approved voice gets used in songs.
audience: [claude, human]
updated: 2026-08-14
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
npm run voice:new -- --instrument bass --slug sub-drone --title "Sub drone"
npm run voice:render -- --voice bass/sub-drone
npm run dev                    # → /voices.html → Play / Pause / Approve
npm run voice:approve -- --voice bass/sub-drone --default
```

## The loop

1. **Fork.** `npm run voice:new -- --from bass/saw-round --slug sub-drone`.
   Always a fork, never a blank file — a preset built from nothing sounds like
   nothing, and the fastest route to a new tone is two knobs off one that
   already works. With `--instrument` instead of `--from`, it copies that
   instrument's current default. The copy lands in `draft`, with `forkedFrom`
   recording where it came from.
2. **Edit the JSON.** Envelopes, oscillators, the amp blocks, the kit's tuning
   and levels. The shape (and what each field is *for*) is
   [`src/engine/voice.ts`](../src/engine/voice.ts); the sound each field makes is
   documented in the seeded voices, which are worth reading before inventing
   numbers.
3. **Render its probe.** `npm run voice:render -- --voice bass/sub-drone --force`.
   The `--force` is not optional after an edit: the audio has no idea the JSON
   moved. Roughly 25 seconds of audio per voice, a couple of minutes of
   rendering for a guitar.
4. **Listen.** `npm run dev` → [`/voices.html`](../voices.html). Tabs are
   instruments, so you see one instrument's sounds at a time; "drafts only"
   narrows it to what you are working on. Play, **Pause** and Resume — judging a
   tone means hearing the same phrase again, not restarting from the top.
5. **Refine** — back to 2 — or **approve**: the ✓ button, or
   `npm run voice:approve -- --voice bass/sub-drone`. Add `--default` to make it
   what `bass` tracks get when they name no voice.
6. **Approved voices are frozen by agreement.** To change one, fork it again.
   That keeps a song that names a voice sounding like it did, and it is how an
   instrument accumulates several sounds worth choosing between instead of one
   sound with a history only git can see.

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

**Read [`voices/archive.md`](../voices/archive.md) before choosing.** It is
generated on every approval and lists what each approved sound is for — the
record of what was auditioned and kept, which is exactly the context needed to
pick voices for a new piece.

## Files

| Path | Role |
|---|---|
| `voices/<instrument>/<slug>.json` | A voice. Folder is the instrument, filename is the slug. |
| `voices/archive.md` | Generated index of approved voices. Never hand-edit; re-approve instead. |
| `src/engine/voice.ts` | Preset shape + validation — tested. |
| `src/engine/voice-library.ts` | Filing, default resolution, approve/fork rules, archive markdown — tested. |
| `src/engine/probe.ts` | The études — tested. |
| `src/app/instruments.ts`, `drums.ts` | Preset → Tone nodes. The amp's block order lives here, because that is the instrument. |
| `src/app/voices.ts` | The bundled registry the graph resolves against. |
| `src/dev/voice-store.ts`, `voice-ops.ts`, `voice-api.ts` | Reading/writing `voices/`, the three operations, and the bench's buttons. |
| `scripts/new-voice.ts`, `render-voices.ts`, `approve-voice.ts` | The three commands. |
| `public/audio/voices/` | Rendered probes + their manifest. What the bench plays. |

## Traps

- **A voice you edited sounds like its old self until you re-render it.** Same
  rule as compositions, same fix: `--force`. The bench prints the render date
  under Play so a stale audition is visible rather than mysterious.
- **Two defaults for one instrument is not a schema error** — each file is valid
  alone — so `--default` demotes the incumbent in the same call, and
  `npm test` fails if two ever coexist.
- **The kit's levels belong to the voice, not the groove.** A pattern says where
  the hits are; how loud a hat sits under a kick is a property of the kit.
- **Deleting a voice a song names** leaves that song unrenderable with a clear
  error rather than a silent substitution — see `voiceFor` in
  [`src/app/voices.ts`](../src/app/voices.ts). A wrong sound that renders anyway
  is the expensive failure: you find it twelve minutes later, by ear.
