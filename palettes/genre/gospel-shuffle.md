---
kind: genre
slug: gospel-shuffle
title: Gospel Shuffle
tags: [gospel-shuffle, 12-8, triplet, shuffle, church, slow, rocking, sway, blues-gospel, swung, testify]

parent: gospel
meter: [12, 8]
tempo: [56, 84]
groove:
  patterns:
    kick:  "X.....x.....X..........."
    snare: "......X...........X....."
    hat:   "x..x..x..x..x..x..x..x.."
    clap:  "......X...........X....."
  fill:
    snare: "......x..x..x..xx.xx.xX."
    tom-lo: "X.....................x."
  fillEvery: 8
---

# Gospel Shuffle

A subtype of [`gospel`](./gospel.md) — that file layers first and supplies the
harmony, the tempo lean and the instrumentation; this one states the **meter**,
which is the entire difference.

12/8: four beats, each split into three. The triplet subdivision is *written out*
rather than swung, which is why this needs `meter` rather than a `swing` value —
a shuffle approximated with swing on a 4/4 grid never quite lands, and at this
tempo the difference is obvious.

## Groove

- **24 steps to the bar.** Every lane above is 24 characters. A 16-step lane here
  fails validation, which is the point of stating the meter.
- **Tempo 56–84**, counted in the four dotted-quarter beats. It feels slower than
  the number suggests.
- **The hat plays the first of each triplet**, the snare the backbeat. The gap
  between them is what rocks.
- Use the `twelve-eight-shuffle` figure for the pitched parts so they agree with
  the kit.

Layer with [`solemn`](../emotion/solemn.md) for a funeral,
[`hopeful`](../emotion/hopeful.md) for the raising of the roof.
