---
title: The session board
purpose: Running orders for a game — how a session plan is written, what the two tabs do, and how a piece gets filed under a campaign. Read before building a playlist for a D&D night.
audience: [claude, human]
updated: 2026-08-19
read_order: 6
see_also: [library.md, looping.md, ../src/engine/session.ts, ../src/app/session-main.ts]
status: living
---

# The session board

`/session.html` is the page you use **at the table**, not the one you compose
with. Two tabs:

| Tab | What it holds |
|---|---|
| **Session** | Tonight's running order — cues in the order you expect to press them, each with a note saying *when*. |
| **Archive** | Every piece in the campaign, to audition from and to add cues out of. |

The composition bench (`/`) stays the place where pieces are judged, deleted and
exported. The board never validates and never touches `compositions/` — it plays.

## Filing a piece under a campaign

A composition carries `"campaign": "<slug>"`. That is what the Archive tab
filters by:

```jsonc
{
  "name": "redwater-tavern-raid",
  "key": "E dorian",
  "campaign": "redwater",
  ...
}
```

It is a field rather than a tag on purpose: at the table you filter by campaign
first and everything else second, and a convention that has to be spelled right
in every file is one that will eventually hide a cue. A piece with no `campaign`
still shows under the archive's **All** chip.

## A session plan

`sessions/<slug>.json`. It holds no music — only pointers into the library, plus
the one thing the library cannot know: when you intend to press play.

```jsonc
{
  "name": "session-14",
  "title": "Session 14 — The Ambush at Redwater",
  "campaign": "redwater",
  "cues": [
    { "entry": "loops/redwater-tavern-raid", "note": "while they arrive" },
    { "entry": "leitmotifs/redwater-lioness-motif", "note": "when the door opens" },
    { "entry": "loops/redwater-golden-lioness-scene", "note": "the fight", "loop": true }
  ]
}
```

- **`entry`** is a library id: the folder plus the filename, `<kind>/<slug>`.
- **`note`** is why the cue is in the list. Click it on the board to edit.
- **`loop`** overrides the default, which is *the piece decides*: anything with a
  `loop` window was written to sit under a scene, so it repeats. A piece with no
  loop window cannot be forced to loop — there is no seam-wrapped body to repeat
  ([looping](looping.md)).

Duplicates are fine. A theme recurring twice in one night is the point of a
[leitmotif](library.md#leitmotifs).

## Writing one

```bash
npm run session:new -- --name "Session 14" --campaign redwater
npm run session:new -- --name "Session 14" --campaign redwater \
  --cues loops/redwater-tavern-raid,leitmotifs/redwater-lioness-motif
npm run session:new -- --name "Session 14" --append --cues segments/aftermath
```

Cue ids that name no piece are **reported but still written** — a plan is
routinely built before the music is, and the board shows an unwritten cue as a
missing cue rather than pretending it is fine. Then compose them and render.

## At the table

- **1–9** fire that cue. **Space** plays/pauses. **Esc** stops. **←/→** scrub 5s.
  **↑/↓** move the fader 5%. **m** mutes.
- The **scrub bar** seeks: click or drag anywhere on it. Duration is only known
  once a cue has been loaded, so the bar sits empty until the first play.
- The **fader** sets the output level and holds it across every cue, seek and
  stop. It is remembered per browser rather than written into the plan: the same
  session played on a laptop and through a speaker wants different levels.
- The header line counts the cues that **cannot sound**, and the page says so on
  load. Two ways a cue goes silent: the piece was never rendered
  (`npm run render -- --file <its .json>`), or the piece was renamed or trashed
  and the cue now points at nothing. Both show the fix in the row.
- Every edit saves to `sessions/<name>.json` as you make it. `npm run dev` has to
  be running — a built bundle has no server to write with, and says so once.

## Two things to know before the game

**Render everything first.** The app synthesises nothing; a cue with no audio is
silence. Open the board once before the session and read the header — that check
is the whole reason the page opens on the Session tab.

**Do not compose or render while a cue is playing.** A new file under
`compositions/` reloads every open page ([live-library](../src/dev/live-library.ts)),
and a reload stops the audio. Session plans themselves are exempt — they are read
over a dev API precisely so that saving a running order mid-game cannot reload
the page — but the composition library is not.
