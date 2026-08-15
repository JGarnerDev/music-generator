---
title: Approved voices
purpose: Index of the instrument sounds we kept — read this before choosing voices for a new piece.
audience: [claude, human]
updated: 2026-08-15
generated_by: npm run voice:approve
---

# Approved voices

Generated — edit the JSON under `voices/`, then re-approve. Each row is a
sound that was auditioned in the voices bench and signed off, so it can be
named by any track: `{ "instrument": "lead", "voice": "<slug>" }`.

**This is the index, not the design record.** Why a voice is built the way it
is — which numbers matter, what happens either side of them — is the `notes`
field of its JSON. Read that for the *one* voice you are forking; read this
table to choose.

## piano

Struck keys. Carries a melody or a chord bed without asking for attention.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`piano/felt-hammer`](./piano/felt-hammer.json) | piano felt soft intimate close ballad lonely | A felt piano: a strip of cloth laid between the hammers and the strings, which is a real preparation and not an effect. |
| [`piano/music-box`](./piano/music-box.json) | music-box bell metal toy childlike eerie lullaby nostalgic | A cylinder music box: pins on a drum plucking the tuned steel teeth of a comb. |
| [`piano/soft-triangle`](./piano/soft-triangle.json) **default** | warm neutral lo-fi | Triangle wave, quick attack, long release, so a chord bed blooms rather than clatters. The house piano, not a real one. |

## epiano

Electric piano — FM bell in the attack, warm body. The lo-fi default.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`epiano/clav-comb`](./epiano/clav-comb.json) | clavinet funk percussive bite short groove rhythm | A clavinet: a rubber tangent slams a string against a fret, a magnetic pickup hears it, and a damper kills it the instant the key comes up. |
| [`epiano/fm-rhodes`](./epiano/fm-rhodes.json) **default** | warm bell lo-fi | Two-operator FM Rhodes — bell in the attack over a body that decays out of the way. The lo-fi electric piano. |
| [`epiano/wurlitzer-reed`](./epiano/wurlitzer-reed.json) | wurlitzer reed bark hollow soul blues lofi | The other electric piano. |

## pad

Slow, wide, sustained. Atmosphere and glue, never the top line.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`pad/mens-choir`](./pad/mens-choir.json) | choir voices wordless spaghetti-western section ah | Wordless men's chorus on one open 'ah' — wide detune, collective drift. Chants under a western; holds harmony, never the tune. |
| [`pad/sine-halo`](./pad/sine-halo.json) **default** | soft atmosphere slow | Pure sine, 0.8 s in and 3 s out. Glue that can never accidentally sound like a hit — the neutral pad. |
| [`pad/string-bed`](./pad/string-bed.json) | strings section bowed sustained spaghetti-western tremolo-bed harmony | Sustained bowed strings with a real violin body notch. The settled held chord a piece can sit on for eight bars. |
| [`pad/string-tremolo`](./pad/string-tremolo.json) | strings section bowed tremolando shimmer tension spaghetti-western | Re-bowed shimmer at 7.5 strokes a second. The bar before something happens — string-bed for when it must not settle. |

## bass

The low end. Owns everything under the guitars; defines the groove with the kick.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`bass/jones-jazz`](./bass/jones-jazz.json) | bass fingerstyle smooth round jazz-bass 60s rock | Clean fingered Jazz Bass on flatwounds — smooth, round, no grit. The 60s/70s rock low end when fuzz would be the wrong record. |
| [`bass/machine-fuzz`](./bass/machine-fuzz.json) | bass fuzz garage dance-punk riff | Bass through a guitar rig, doing the whole guitar section's job. Garage and dance-punk, where the riff is the bass. |
| [`bass/saw-round`](./bass/saw-round.json) **default** | round neutral lo-fi | Plain sawtooth, soft attack, sits under everything without arguing. The neutral default — reach past it when the genre wants character. |
| [`bass/upright-pizz`](./bass/upright-pizz.json) | bass upright double-bass pizzicato gut spaghetti-western acoustic | Plucked double bass, gut and air, no amp. The low end for acoustic and western cues where an electric bass is the wrong century. |

## pluck

Rhythm guitar: tight, fast-decaying, wide, low in the mix.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`pluck/brown-rhythm`](./pluck/brown-rhythm.json) **default** | guitar rhythm chug brown-sound | Two detuned saws into a mid-forward rig with the lows kept out of the drive. The default chug: low, wide, under the lead. |
| [`pluck/chainsaw-chug`](./pluck/chainsaw-chug.json) | guitar rhythm chug fuzz chainsaw | Square oscillators with the low strings let into the drive. The rhythm half of the chainsaw rig, under lead/doom-fuzz. |
| [`pluck/nylon-arpeggio`](./pluck/nylon-arpeggio.json) | guitar nylon classical spanish spaghetti-western arpeggio fingerstyle | Nylon-string classical guitar, no amp. The fingerpicked arpeggio bed for a western or Spanish cue while the twang rests. |
| [`pluck/sitar-jawari`](./pluck/sitar-jawari.json) | sitar plucked buzz drone raga indian | A plucked string whose brightness never collapses — jawari buzz, no amp. Drone and raga colour, unlike any guitar here. |

## lead

Top line guitar: compressed into sustain, mid-forward, centred, loud.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`lead/brown-lead`](./lead/brown-lead.json) **default** | guitar lead sustain brown-sound | Compressed brown-sound solo tone: held notes sing instead of decaying, mid-forward and centred. The default rock lead. |
| [`lead/deguello-trumpet`](./lead/deguello-trumpet.json) | trumpet brass mariachi spaghetti-western solo blare | Lone mariachi trumpet that gets brighter as it gets louder. The funeral-march top line over a western cue. |
| [`lead/desert-twang`](./lead/desert-twang.json) | guitar lead twang surf spaghetti-western clean slapback | Bright clean single-coil twang drowning in slapback. The hard-picked surf/western hook — brown-lead inverted. |
| [`lead/doom-fuzz`](./lead/doom-fuzz.json) | guitar lead fuzz doom sustain | Chainsaw fuzz where one note reads as a power chord. Doom and stoner leads; sits over pluck/chainsaw-chug. |
| [`lead/harmonica-reed`](./lead/harmonica-reed.json) | harmonica harp reed spaghetti-western wail dust | Wailing cupped harmonica, rasp under 3 kHz. One held note over an empty station — the western that answers a man. |
| [`lead/lone-whistle`](./lead/lone-whistle.json) | whistle human spaghetti-western lonely solo sine | A man whistling the tune — near-pure sine, no instrument at all. The loneliest top line in the palette. |
| [`lead/soprano-wordless`](./lead/soprano-wordless.json) | voice soprano wordless spaghetti-western ecstasy soaring | Soaring wordless soprano built on formants. The line that turns a western cue into ecstasy; nothing goes above it. |
| [`lead/string-section`](./lead/string-section.json) | strings violins section bowed unison spaghetti-western tutti | Six violins taking the tune in unison — the tutti line when a cue stops being a whistle and becomes a film. Expensive. |
| [`lead/violin-arco`](./lead/violin-arco.json) | violin strings bowed arco solo singing | Solo bowed violin, no amp, sustain from the bow rather than a compressor. The singing top line when a guitar would be wrong. |

## drums

The kit — levels, tuning and decay per piece.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`drums/brush-kit`](./drums/brush-kit.json) | kit brushes jazz blues lofi quiet ride cross-stick | Brushes and cross-stick, ride louder than the kick. The quiet kit for jazz, blues and downtime — where a struck snare would read as combat. |
| [`drums/frontier-kit`](./drums/frontier-kit.json) | kit western spaghetti-western gunshot whipcrack anvil timpani | Spaghetti-western percussion, barely a kit: snare is a gunshot, hat a whipcrack, tom an anvil. Picked for the setting, not the groove. |
| [`drums/house-kit`](./drums/house-kit.json) **default** | kit neutral lo-fi | Pitched membrane thumps plus filtered noise bursts, levels baked in. The neutral kit for anything not chasing a specific record. |
| [`drums/slab-kit`](./drums/slab-kit.json) | kit rock metal backbeat room ride | Rock backbeat kit — short clicky kick, cracking snare, a ride that stays countable under distortion. When the drums carry the groove. |

## Lineage

Who was forked from whom. Read the parent's `notes` before forking a child.

```
piano/soft-triangle
  piano/felt-hammer
  piano/music-box
epiano/fm-rhodes
  epiano/clav-comb
  epiano/wurlitzer-reed
pad/sine-halo
  pad/mens-choir
    pad/string-bed
      pad/string-tremolo
bass/saw-round
  bass/machine-fuzz
    bass/jones-jazz
      bass/upright-pizz
pluck/brown-rhythm
  pluck/chainsaw-chug
  pluck/nylon-arpeggio
  pluck/sitar-jawari
lead/brown-lead
  lead/desert-twang
  lead/doom-fuzz
  lead/violin-arco
    lead/deguello-trumpet
    lead/harmonica-reed
    lead/lone-whistle
    lead/soprano-wordless
    lead/string-section
drums/house-kit
  drums/brush-kit
  drums/frontier-kit
  drums/slab-kit
```
