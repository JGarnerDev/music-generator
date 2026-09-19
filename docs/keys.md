---
title: Keys — the computer keyboard as an instrument
purpose: Playing a phrase at the keyboard and handing it over as notes. The loop, bending, the click, and why this is the one page that synthesises.
audience: [claude, human]
updated: 2026-09-18
read_order: 5
see_also: [../readme.md, ../claude.md, deploy.md, transcribe.md, rendering.md, library.md]
---

# Keys

The user has a phrase in their hands rather than in words. `/keys.html` lets
them play it on the computer keyboard, records it, and writes it out as notes —
which is the only form Claude can read, since Claude cannot hear.

It is the sibling of [transcription](./transcribe.md), and the two answer the
same question from different ends. A guitar take is audio that has to be
*guessed* at; a keyboard take is exact from the first keystroke, because the
pitch is the key that was pressed and the rhythm is when it was pressed. So
everything transcription spends its effort on — tempo estimation, octave
doubling, `--requantize` — is either unnecessary here or free.

```bash
npm run dev                  # then open /keys.html
npm run take:read -- --list
npm run take:read -- --file recordings/keys/<name>.take.json
npm run take:read -- --file recordings/keys/<name>.take.json --key Am
npm run take:read -- --file recordings/keys/<name>.take.json --emit <slug>
```

## The loop

1. **Play.** The page is an instrument the moment it loads — no Start button,
   nothing to arm. `Z` is middle C.
2. **Pick a voice** if you want a different one. The instrument tabs and the
   dropdown are the same shelf `voice:find` searches — see
   [voices](./voices.md). Drums and section voices are not offered, for reasons
   under [what it will not play](#what-it-will-not-play).
3. **Turn the click on** and set the tempo you want to play at. It runs until
   you turn it off — see [the click](#the-click).
4. **Record.** Recording waits for the click's next downbeat, so the bars you
   were already playing over *are* the count-in. With the click off it starts
   the moment you press it.
5. **Stop** (the button, or space). The summary appears immediately — the same
   block `transcribe` prints: bar grid, rhythm lane, scale degrees, contour,
   range, where the peak is.
6. **Name it and Save.** It writes `recordings/keys/<name>.take.json` and tells
   you the path. **That path is the handoff** — give it to Claude, who reads it
   with `npm run take:read`. (On the deployed app there is no server to write
   it, so the take is handed to the phone instead — see [on a phone](#on-a-phone).)

Then it is notes like any other notes: quote it into a piece, emit it as a
leitmotif, arrange around it.

## Playing it

The layout is the one every tracker has used: the home row is the white keys and
the row above it holds the black ones in the gaps, with the QWERTY row doing the
same an octave up. `Z` is the base octave's C; `Q` is the C above it.

| Key | |
|---|---|
| `Z S X D C V G B H N J M , L . ; /` | lower manual, C upward |
| `Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P` | upper manual, an octave above |
| `F` `K` | bend down / up a whole step, while held |
| `←` `→` | move both hands an octave |
| `↑` `↓` | velocity, in four steps |
| `space` | start / stop recording |
| `esc` | panic — release everything |

Octave, bend and the click also have buttons, for when one hand is on the mouse.
The mouse plays the drawn keyboard too, which is the quick way to check a voice
without committing to a phrase.

### No Start button

A browser will not make a sound until the user has done something on the page —
but **playing a key is doing something**. So the first note wakes the audio and
sounds, in that order, and there is nothing to press first.

Two details make that work rather than merely sound nice. The audio graph is
built on *mount*, against a context that is still suspended, which is allowed
and is what stops the first keypress paying to construct an instrument. And the
take is logged in the key handler, not alongside the attack: the note's time is
the millisecond the key went down, whether or not the audio was ready to make a
sound yet, so a take is exact even across the wake.

The one thing that is genuinely lost: a key tapped and released *during* that
first wake — a few milliseconds — is not struck at all. A note whose attack
arrives after its release is a note that never stops, which is a worse bug than
a first tap that did not sound.

The click is the only control that makes a sound without a key being played, so
it wakes the audio itself; pressing its button is the gesture that permits it.

## Bending

Hold `F` or `K` and everything sounding travels a whole step — down and up
respectively. They are the two keys in the middle of the home row that sound
nothing (there is no black note between E-F or B-C), so they fall under the
index fingers without moving the hand, the way a guitarist bends while the rest
of the phrase keeps going.

It is a **pitch wheel, not a per-note effect**: notes struck while it is held
are struck in the bent key. A whole step because that is the bend a player means
by "the bend" — a semitone reads as being out of tune rather than as a gesture.

**Bends are recorded.** Each one is written onto the note that was sounding
under it — the most recent onset, or the top note of a chord, since a bend under
a chord is a melody note being pushed rather than the harmony sliding. It lands
in the take as a `bend` on that note and survives `--emit` into the composition,
where it renders through exactly the machinery in [bends](./bends.md). Releasing
the key before the note ends records the return too.

One bend per note, and a bend with nothing sounding under it is dropped rather
than moved to the nearest note — that would invent a bend nobody played over a
note they did.

## The click

A practice aid first, and the take's grid second. Turn it on and it clicks until
you turn it off; recording neither starts nor stops it. **It is never recorded** —
a take is a list of key presses, and the click is not one, so nothing of it can
reach the file even in principle.

The tempo is the click's, and it is the only number on the page. Changing it
moves the pulse under your hands immediately, and it is what the grid is built
from afterwards, which is why playing *to* it matters: a tempo typed in after
the fact writes an evenly-played phrase as a stumble.

A running click is also the count-in. Arming the recorder waits for its next
downbeat, which is why there is no count-in setting to choose — you are counted
in by the bars you were already playing over. A phrase that comes in on the "and"
of 4 is therefore recorded as a pickup rather than slid onto the downbeat.

With the click off, recording starts the moment you press Record and the grid is
anchored there.

## The take asks for a name, and nothing else

Everything else that used to be a form field is either inferred or moved:

- **Tempo** belongs to the click, above — the tempo you can hear.
- **Key** is inferred from the notes ([`key-guess.ts`](../src/engine/key-guess.ts)),
  so the summary still reads in scale degrees. The guess is right about the
  *notes*; where it can be wrong is which end of a relative pair is home, since A
  minor and C major contain the same seven. The summary always names the
  alternative, and `take:read --key <key>` takes it.
- **Grid** is sixteenths, and **notes stay held as played**. Both are re-readable
  afterwards with `--grid` and `--one-line`.

Held-as-played is the one place this path deliberately disagrees with the guitar
one: a struck string rings past the phrase and has to be trimmed, but on a
keyboard a held chord *is* a held chord, and trimming it deletes the harmony.

**Re-reading is free.** The take is derived from the presses every time
something changes, so renaming it, or fixing the tempo you meant, costs no
second performance. That is `--requantize`, in the page, by default.

## What it will not play

**Drums.** A kit piece is a name, not a note — there is nothing for a keyboard
to be. Tap a beat somewhere else and write the groove as a groove; see
[grooves](./grooves.md).

**Section voices.** A desk of eight players is eight synths of polyphony behind
every key, which is a render-time cost meeting a realtime deadline. Play the
line on a solo voice and arrange the section around the take afterwards — which
is also how it would be played.

**Amped voices** (guitar rigs) do play, and are the heaviest thing here: ~85% of
render cost is in those chains ([rendering](./rendering.md#speed-measured)). One
guitar under one pair of hands fits comfortably; if it crackles on a busy
machine, play fewer notes at once or pick a cleaner voice. **The recorded take is
unaffected either way** — key presses are timestamps, not audio, so a take
recorded through a stuttering voice is still exact.

## On a phone

The same page is deployed as a standalone app you can install on a phone —
how, and where, is [deploy](./deploy.md). It is the only page here that can be:
everything else plays rendered files or writes to the repo, and this one
synthesises and does neither.

What changes when a finger is doing the pointing rather than a mouse:

- **The drawn keyboard is the instrument**, not a picture of what the letter
  keys are doing. So it gets the screen — in landscape the keys, the controls
  and the transport are what fits, and the title, the voice picker and the
  summary scroll below the fold, because you have finished with those by the
  time a phrase starts. Portrait fits the whole range at about 20 px a key;
  landscape is 45 px, which is the difference between hunting a phrase and
  playing one.
- **Velocity gets buttons.** It was the arrow keys only, and a phone has no
  arrow keys — so on a touch device it was previously stuck at 0.8 forever.
- **The bend buttons lose their letters** (`↓ F` becomes `↓`), and the legend
  names buttons rather than keys. An instruction to press a key that does not
  exist is worse than no instruction.
- **Save becomes Download, Copy and Share**, because there is no dev server to
  write to. Stop also shelves the take in the browser's storage — a phone
  discards a background tab within a minute or two, and that used to be a
  performance nobody could play again.

The take comes back with `npm run take:import -- --file <path>` (or `--stdin`
for what Copy put on the clipboard), which validates it, writes it into
`recordings/keys/` and prints the summary. From there it is a take like any
other.

**Two things that surprise people.** An iPhone on silent plays nothing from a
web page unless the page asks for the `playback` audio category, which this one
does — if it is silent anyway, that is a bug rather than the switch. And the
app works with no signal at all after the first load; nothing here needs a
network to make a sound.

## Reading a take

```bash
npm run take:read -- --file recordings/keys/tavern-hook.take.json
```

Prints the same summary the bench showed, plus what it was played on and when.
Flags:

| Flag | Why you'd reach for it |
|---|---|
| `--list` | Every take on disk, newest first. |
| `--key <key>` | Read the notes against a stated key instead of the inferred one. The flag the summary's "wrong end of the pair" line exists for. |
| `--grid <4\|2\|1>` | Re-read on a **coarser** grid. Finer is refused — the notes were snapped when they were saved, and nothing can put back what that rounded off. Drops bends, whose position is a fraction of a note length that is about to change. |
| `--one-line` | Re-read with every note cut at the next onset. |
| `--emit <slug>` | Write it into `compositions/leitmotifs/` (or `--kind segments`). |
| `--instrument` / `--voice` | Emit onto a different instrument from the one played. |
| `--force` | Overwrite an existing composition at `--emit`. |

`--emit` tags the piece `played`, which is provenance worth keeping: it says a
human performed those note lengths, so the odd unquantizable one is a player and
not a mistake. It does **not** render — that is
`npm run render -- --file <path>`, like everything else.

Emitting onto a different instrument **drops the voice it was played with**,
because a voice belongs to one instrument: `piano/soft-triangle` is not a lead,
and carrying the name across fails the render rather than the emit. Name a
`--voice` if you want a specific one. Moving the tune also moves its register —
read [the octave rule](./library.md) before transposing it anywhere but an
octave.

## Why this page synthesises when nothing else does

[`docs/rendering.md`](./rendering.md) rejected live synthesis in the browser, and
that rejection stands. It was about playing a *written arrangement* in realtime —
seven tracks, two guitar amps, notes scheduled ahead — which misses the buffer
deadline and comes out with holes in it.

A keyboard is not that. One instrument, one voice, a hand's worth of notes, and
nothing scheduled at all: a key goes down, a note starts. It is also the one
sound here that *cannot* be a file, because a keypress cannot be rendered before
it happens.

The deadline is respected rather than assumed:

- the voice is built under `LIVE_QUALITY` in
  [`quality.ts`](../src/app/audio/quality.ts) — eight voices of polyphony, single
  oscillators, one player;
- Tone's `lookAhead` is zero, because its default 0.1 s is 100 ms of latency
  between the key and the sound, which is enough to make a player feel they are
  playing badly;
- polyphony is **stolen**, oldest first, rather than left to throw past its
  ceiling — a stolen note is a piano's own behaviour, an exception mid-phrase
  kills the performance;
- the bend is stepped from a timer at 8 ms rather than ramped on a signal, since
  a `PolySynth` exposes no detune signal to ramp. That is what a hardware pitch
  wheel does too, and the steps land around 14 cents apart — under what anybody
  hears as a step. It uses the same curves the renderer does, so a bend feels in
  the hand like it will sound in the file.

And it renders nothing. A take leaves as notes; notes become audio through the
CLI, like every other note in this project.

## Where the code is

| Path | Role |
|---|---|
| `src/engine/keys.ts` | The layout, the drawn keyboard, the bend keys — pure, tested. |
| `src/engine/take.ts` | Presses → notes → the take file, bends attached to the notes that were sounding. The back half is `transcribe`'s. |
| `src/engine/key-guess.ts` | What key that was in, and the relative it might be instead. |
| `src/engine/keys-bench.ts` | What the page says, and which voices it will play. |
| `src/app/audio/live.ts` | The realtime voice, the pitch wheel, and waking the context. The only realtime synthesis here. |
| `src/app/audio/metronome.ts` | The click and the count-in. |
| `src/app/hooks/useKeyboardSynth.ts` | Key events → notes and the press log. |
| `src/app/pages/Keys.tsx` + `keys.css` | The page. |
| `src/dev/take-api.ts` + `take-store.ts` | Saving a take. Dev server only. |
| `src/engine/take-shelf.ts` | Takes held on the device, where there is no server to save to. |
| `scripts/take.ts` | `npm run take:read`. |
| `scripts/take-import.ts` | `npm run take:import` — a take played on the phone, landed in the repo. |
