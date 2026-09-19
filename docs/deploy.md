---
title: Deploying the keys app
purpose: Putting /keys.html on the internet as a phone app — what ships, what cannot, how a take gets back to the repo.
audience: [claude, human]
updated: 2026-09-18
read_order: 6
see_also: [keys.md, rendering.md, ../readme.md, ../claude.md]
---

# Deploying the keys app

`/keys.html` is the only page here that can leave this machine, and the reason
is the same one that makes it the odd page out in
[rendering](./rendering.md): **it synthesises**. Every other bench reads the
library off the dev server and plays rendered MP3s out of `public/audio/` —
40 MB of gitignored files and four Vite plugins that only exist while
`npm run dev` is running. The keys page needs none of it. The voices are a few
numbers each, bundled at build time, and the notes come out of your hands.

So it builds on its own, into a static folder any host will serve:

```bash
npm run build:keys     # → dist-keys/
npm run preview:keys   # serve that folder locally and check it
```

The build is [`vite.keys.config.ts`](../vite.keys.config.ts). It differs from
the bench build in three ways, all forced: `base: "./"` so the output works at
a domain root *or* a subpath, `publicDir: false` so the 40 MB of renders stay
behind, and `keys.html` renamed to `index.html` so the phone URL is a bare
domain. It also writes a service worker naming every file it just built.

## Put it somewhere

Any static host. Three that need no configuration beyond this:

| Host | Command |
|---|---|
| **GitHub Pages** | Enable Pages → Source: *GitHub Actions*, then push. [`.github/workflows/deploy-keys.yml`](../.github/workflows/deploy-keys.yml) builds and deploys on every push to `master`. URL: `https://<user>.github.io/music-generator/` |
| **Cloudflare Pages** | `npm run build:keys && npx wrangler pages deploy dist-keys` |
| **Vercel** | `npm run build:keys && npx vercel deploy --prod dist-keys` |

The workflow is the one to prefer if the repo is already on GitHub: it is the
only option where a take you improve on your laptop reaches your phone by being
pushed, with nothing to remember.

Nothing here is secret and nothing here writes, so the app can be public
without thinking about it. It has no server side to attack: it is HTML, a
JavaScript bundle and four static files.

## Install it on the phone

Open the URL, then add it to the home screen — **Share → Add to Home Screen**
on iOS, **⋮ → Install app** on Android. It is a real install rather than a
bookmark, and it is worth doing for three reasons:

- **No browser chrome.** That is about 120 px of height, which is a third of
  the keyboard on a phone in landscape.
- **It opens offline.** The service worker precaches the whole app on first
  load, so it works on a train. Nothing here ever needed the network after the
  first visit.
- **The icon.** Drawn by `npm run keys:icons` from the page's own palette —
  see [`scripts/keys-icon.ts`](../scripts/keys-icon.ts).

A deploy lands on the next load that has signal: the document is fetched
network-first and everything else is content-hashed, so there is no cache to
clear and no version to bump.

### Turn the phone sideways

Portrait fits the whole two-and-a-bit octaves at about 20 px a key, which is
enough to hunt a phrase out. Landscape is 45 px a key, which is enough to
*play*. The layout takes the hint: in landscape the keyboard, the controls and
the transport are what fit on screen, and the title, the voice picker and the
summary move below the fold, because you have finished with those by the time a
phrase starts.

### If it makes no sound on an iPhone

Check the silent switch — and if it still does not, that is a bug, not the
switch. An `AudioContext` on iOS lands in the *ambient* audio category, which
the hardware mute silences; [`src/app/audio/live.ts`](../src/app/audio/live.ts)
asks for `playback` instead on the way through the wake, which is the fix. It
needs Safari 16.4 or newer.

## Getting a take back

This is the part the deploy costs you. On this machine, Save POSTs the take to
a Vite plugin that writes `recordings/keys/<name>.take.json`. A static host has
nobody to POST to, so the app hands the file to the *phone* instead, and you
carry it the last step:

1. Play and record as usual. **Stop shelves the take on the device** — see
   below — before you decide anything.
2. **Share** (iOS, Android: the share sheet, which ends in Files, Notes,
   AirDrop, a message to yourself), **Download** (the browser's downloads), or
   **Copy** (the whole take as JSON on the clipboard).
3. On the machine with the repo:

```bash
npm run take:import -- --file ~/Downloads/tavern-hook.take.json
npm run take:import -- --stdin        # paste what Copy put on the clipboard
npm run take:import -- --file <path> --name tavern-hook-2 --force
```

It validates before writing — same check the dev server makes, for the same
reason — and prints the summary, so importing and reading are one step. After
that it is a take like any other: `npm run take:read -- --file <path> --emit
<slug>`, and [keys](./keys.md) covers the rest.

### The shelf

Every stop writes the derived take to `localStorage`, and the app lists what it
is holding under the transport. This is not a nicety: a phone discards a
background tab within a minute or two, and a discarded keys page used to be a
performance nobody could play again. Twelve takes, newest first, one entry per
name — [`src/engine/take-shelf.ts`](../src/engine/take-shelf.ts).

It is a holding pen, not a library. The library is `recordings/keys/`, and a
take that matters gets imported into it; the thirteenth take pushes the first
one off.

## What the deployed app cannot do

Worth knowing before you reach for something that is not there:

- **It cannot render.** No page here renders — audio comes out of the CLI. See
  [rendering](./rendering.md).
- **It has no library.** No compositions, no sessions, no studies, no voices
  bench. Those read and write the repo through dev-server plugins, and a
  deployed copy of them would be four pages of buttons that fail at the network.
  The standalone build drops the links to them rather than shipping 404s.
- **It cannot write to the repo.** That is the section above.
- **Drums and section voices still decline to play**, for the reasons in
  [keys](./keys.md#what-it-will-not-play) — nothing to do with deployment.

## Where the code is

| Path | Role |
|---|---|
| `vite.keys.config.ts` | The standalone build: base, icons, `index.html`, the service worker. |
| `scripts/keys-icon.ts` + `src/utils/png.ts` | The home-screen icon, drawn rather than committed. |
| `public/keys.webmanifest` | What makes it installable. Copied into the build by name. |
| `src/engine/take-shelf.ts` | Takes held on the device, and the JSON a download is made of. |
| `scripts/take-import.ts` | `npm run take:import` — the other end of the handoff. |
| `src/globals.d.ts` | `__KEYS_APP__`, which is how the page knows which of its two builds it is. |
