---
title: Keyboard takes
purpose: What lives in this folder, and why these files are committed when the WAVs next door are not.
audience: [human, claude]
updated: 2026-09-18
see_also: [../readme.md, ../../docs/keys.md]
status: living
---

# Keyboard takes

`<name>.take.json` — a phrase played at `/keys.html`, written here by the Save
button. One take per file: the notes on a sixteenth grid, plus the tempo, key,
meter and voice it was played with.

**Committed, unlike the guitar takes in the folder above.** A `.wav` is a large
binary whose transcription is the source of truth; a take *is* the notes, a few
kilobytes of them, and losing one loses the performance.

Read one with:

```bash
npm run take:read -- --list
npm run take:read -- --file recordings/keys/<name>.take.json
```

The full loop — how to play one, the three settings that change what the notes
mean, and what the keyboard will not play — is
[`docs/keys.md`](../../docs/keys.md).
