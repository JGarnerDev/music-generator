---
title: Studies — deciding how to approach a musical concept
purpose: The third bench and its loop. How a set of attempts is fanned out, judged, and turned into a taste rule. Read before running study:new.
audience: [claude, human]
updated: 2026-08-16
read_order: 11
see_also: [taste.md, hooks.md, variety.md, voices.md]
status: living
---

# Studies

The other two benches each answer a question about a *thing*. The composition
bench asks "is this piece good". The voice bench asks "is this sound good". A
study asks a question neither can:

> **How should we approach a guitar solo at all?**

That is not a question about one piece. It is a question about every piece after
it — and until it is asked out loud, it gets answered silently, the same way,
forever. `docs/variety.md` describes what happened the last time: four loops
became one song because nobody chose. This is the mechanism for choosing on
purpose, and for the choice to be *the user's* rather than the composer's
defaults.

## The unit

A **study** is one short rendered attempt at one concept. A **set** is four
attempts that differ on exactly **one axis** and share everything else — key,
tempo, backing, voices, seed.

The one-axis rule is the whole design. Two attempts that differ on register and
phrasing produce a thumb that cannot be attributed to either, which is a verdict
that can never be counted with any other verdict. `study:new` enforces it
structurally: the composition is generated once and the variants are derived
from it, so nothing but the axis *can* move.

## The loop

```bash
# 1. see the shelves
npm run study:new -- --concepts        # ~35 concepts, grouped
npm run study:new -- --axes            # what a set may differ on

# 2. fan out a set — --only strips it to the parts the question is about
npm run study:new -- --concept chorus-lift --axis register \
  --mood "storm breaks over the ridge" --with desert-rock --only bass,pluck,lead

# 3. render it (studies are ~9 bars, so a set costs about one segment)
npm run study:render -- --set chorus-lift/storm-breaks-over

# 4. judge it
npm run dev     # → /studies.html → play, pick tags, thumb

# 5. distil the finding into docs/taste.md, by hand

# 6. tear it down
npm run study:clean -- --set chorus-lift/storm-breaks-over        # dry run
npm run study:clean -- --set chorus-lift/storm-breaks-over --yes  # do it
```

Step 4 rewrites `studies/ledger.md` on every click. Step 5 is not a command:
when a tag has been said the same way four or five times, that pattern gets
written into [`docs/taste.md`](./taste.md) as prose, by hand.

## The teardown is part of the loop

**A study is scratch.** It exists to produce one rule, and once that rule is
written the JSON and the MP3s are worse than dead weight: a set sitting in the
bench with its finding already distilled invites a *second* verdict on a
question that has been answered, and then the ledger and the rule disagree.
`studies/` is a queue of open questions, not an archive of closed ones.

So `taste.md` is written to survive without any of it — no set names, no ids, no
filenames, no links into `studies/`. If a rule cannot be understood after the
files are gone, it is not written well enough to keep. What survives is the
finding: concept, axis, which way the thumbs went, what to do about it. That is
enough to argue with a rule and enough to overturn one, because a study is
regenerable — same concept, same axis, a new mood.

`study:clean` defaults to a **dry run** and prints what would go. It also holds
back anything still unjudged, because deleting an attempt nobody thumbed throws
away the render *and* the question, and once the file is gone neither is written
down anywhere. `--include-unjudged` overrides that; `--yes` performs the delete.

Unlike a composition, which is moved into `compositions/_trash/`, this is a real
`rm`. The asymmetry is deliberate: a composition is the work and cannot be
regenerated, a study can be.

## Strip it to the question

`--only <instruments>` keeps the first track of each instrument named and drops
everything else. **Use it on every set.** A palette writes the arrangement it
would really write — drums, pad, a rhythm comp, an arpeggio doubling it, a lead
— and against six parts an axis is something the ear has to go hunting for
rather than something it notices.

The failure is not hypothetical and it is not a thumbs-down: a set fanned out at
full density comes back with *every attempt approved and not one tag*, because
each one sounded fine and none of them sounded different. That is eight renders
and a listening session spent to learn nothing, and it is indistinguishable in
the ledger from a genuine "all of these work".

Three or four tracks is the target: the part the axis moves, whatever it has to
relate to, and one harmonic anchor so the interval quality is audible. Drums and
pad go unless they *are* the question. A set that needs two of one instrument
adds the second as its varying part, which is why `--only` keeps just the first
of each.

Then say, in the handoff, what to listen for in each attempt. The bench shows
the `approach` line; make it the sentence that tells the ear where to point.

## Knob axes and written axes

`npm run study:new -- --axes` splits the shelf in two, and the split is the most
important thing to understand before running it.

**Knob axes** — `register`, `tempo`, `figure`, `harmonic-rate` — are things the
composer already turns. The four attempts differ for real the moment they are
written, and they render immediately.

**Written axes** — `phrasing`, `contour`, `density`, `note-choice`, `entry`,
`resolution`, `interplay`, `tone`, `gesture` — are judgements no field encodes. The fan-out
can only scaffold them: it writes the shared backing four times and marks each
file `"draft": true`. Nothing renders while that flag is set, because four
identical files would produce four verdicts about nothing.

Finishing a written set means, per file: compose the varying part into
`composition`, replace the placeholder `variant` ("take A") with what it actually
is ("long held bends"), rewrite `approach` to match, and delete `"draft": true`.
Then render.

This is honest about where the judgement lives. A script cannot fan out four
phrasings; it can only guarantee that the four phrasings are heard against
identical material.

## Concepts

Fixed shelf, in `src/engine/study.ts`. A concept invented for one study is a
concept with one data point forever, and the entire value here is the *second*
time a verdict lands on the same question — so add to the shelf deliberately, in
that file, rather than by creating a folder.

Every concept maps to a lever that exists: a knob in `knobs.ts`, a field in a
composition, or a decision [`hooks.md`](./hooks.md) names and nothing checks. The
seven groups are the bench's tabs: `melody`, `harmony`, `rhythm`, `arrangement`,
`form`, `loop`, `sound`.

## Verdict tags

Also a fixed shelf. **A thumb says whether; a tag says what about it**, and the
tag is the half that can be counted.

Polarity lives in the thumb, not the tag. `breathes` on a thumbs-down means "the
space was the only good part about it" — exactly the split a one-word verdict
would have thrown away. That is why the tallies keep both columns instead of
netting them: a tag with three ups and three downs is a tag being used for two
different things, which is a gap in the shelf, not a preference.

Print them with `npm run study:verdict -- --tags-shelf`. A verdict with no tag
and no note is recorded but teaches nothing, and the bench says so.

## Files

| Path | What | Lifetime |
|---|---|---|
| `studies/<concept>/<set>-<a…d>.json` | One attempt. Folder = concept, exactly like `compositions/` and `voices/` | Deleted once distilled |
| `studies/ledger.md` | **Generated.** Every verdict, plus the tallies. Never hand-edited | Shrinks as sets are torn down |
| `public/audio/studies/` | Rendered MP3s + their own manifest | Deleted with the study |
| [`docs/taste.md`](./taste.md) | **Hand-written.** The rules — what to actually do | **Permanent. The only record** |

The split between the ledger and `taste.md` is the same split the voices archive
makes. Counting is mechanical; deciding what a count *means* is not — "six
thumbs-down on `cluttered`" does not tell you which part to drop. The difference
here is that the ledger is also *temporary*, so the judgement has to be made
before the evidence is thrown away.

## Rules

1. **One axis per set.** Everything else held. Enforced by the fan-out; broken
   only by hand-editing two things in one file.
2. **Short.** Nine bars, the composer's `sample` form. A study you don't want to
   hear twice teaches nothing about a piece you would hear ten times.
3. **Sparse.** `--only` down to the parts the axis is about. An attempt whose
   difference is inaudible under the arrangement is an attempt that gets thumbed
   on nothing.
4. **Tag every verdict.** An untagged thumb is a preference that cannot be
   counted with any other.
5. **Never edit the ledger.** The JSON is the source of truth; a hand edit there
   becomes a second one.
6. **Re-judging replaces.** A study can be thumbed again and the new verdict
   overwrites the old — "what I think now" is the only useful reading of a taste
   record.
7. **Distil, then delete.** A set that has produced its rule gets torn down with
   `study:clean`. Leaving it invites a second verdict on a settled question.
8. **A rule must survive its study.** No ids, no set names, no filenames in
   `taste.md` — the files it came from will not exist.

## Reading it back

Before writing bars, read `studies/ledger.md`'s **Signals** table and
[`taste.md`](./taste.md). The ledger is cheap enough to read every time by
design: it is a tally and a row per verdict, not an essay per study.

`variety.md` keeps pieces from resembling each other. `hooks.md` keeps a piece
from being forgettable on its own. This keeps both from being answered by
somebody else's taste.
