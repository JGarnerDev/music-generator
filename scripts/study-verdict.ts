/**
 * Judge a study from the terminal, and regenerate `studies/ledger.md`.
 *
 *   npm run study:verdict -- --study hook/dusty-standoff-a --thumb up --tags memorable,breathes
 *   npm run study:verdict -- --study hook/dusty-standoff-b --thumb down --note "peak lands in bar 2"
 *   npm run study:verdict -- --study hook/dusty-standoff-b --clear
 *   npm run study:verdict -- --ledger        # just rewrite the ledger
 *   npm run study:verdict -- --tags-shelf    # print the tag shelf
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * The bench (`npm run dev` → `/studies.html`) is the normal way in — judging by
 * ear means the buttons should be where the sound is. This exists so the same
 * operation is scriptable, and because both front ends call the one
 * implementation in [`src/dev/study-ops.ts`](../src/dev/study-ops.ts), a click
 * and a command cannot come to mean different things.
 */
import { Command } from "commander";
import { TAG_FACETS, VERDICT_TAGS, tagsOfFacet } from "../src/engine/study";
import { judge, unjudge } from "../src/dev/study-ops";
import { writeLedger } from "../src/dev/study-store";

const program = new Command();
program
  .name("study:verdict")
  .description("Record a thumb on a study and rewrite studies/ledger.md")
  .option("--study <concept/slug>", "the study to judge, e.g. hook/dusty-standoff-a")
  .option("--thumb <up|down>", "the verdict")
  .option("--tags <csv>", "shelf tags saying what the thumb is about", "")
  .option("--note <text>", "one line the shelf tags don't cover")
  .option("--clear", "take the verdict back — the study returns to the queue", false)
  .option("--ledger", "rewrite studies/ledger.md and exit", false)
  .option("--tags-shelf", "print the verdict tag shelf and exit", false)
  .parse(process.argv);

const opts = program.opts<{
  study?: string;
  thumb?: string;
  tags: string;
  note?: string;
  clear: boolean;
  ledger: boolean;
  tagsShelf: boolean;
}>();

if (opts.tagsShelf) {
  console.log("Verdict tag shelf — a thumb says whether, a tag says what about it:\n");
  for (const facet of TAG_FACETS) {
    console.log(`  ${facet}`);
    for (const tag of tagsOfFacet(facet)) console.log(`    ${tag.name.padEnd(20)} ${tag.blurb}`);
    console.log("");
  }
  console.log(`  ${VERDICT_TAGS.length} tags. Polarity is the thumb's job, not the tag's.\n`);
  process.exit(0);
}

if (opts.ledger) {
  console.log(`Rewrote ${writeLedger()}.`);
  process.exit(0);
}

if (!opts.study) {
  console.error("Nothing to judge: pass --study <concept/slug>, or --ledger to just rebuild.");
  process.exit(2);
}

try {
  if (opts.clear) {
    const result = unjudge(opts.study);
    console.log(`${result.id} is back in the queue. Ledger rewritten.`);
    process.exit(0);
  }

  if (opts.thumb !== "up" && opts.thumb !== "down") {
    console.error('--thumb must be "up" or "down". Or pass --clear to take a verdict back.');
    process.exit(2);
  }

  const tags = opts.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const result = judge(opts.study, { thumb: opts.thumb, tags, note: opts.note });
  const verdict = result.study.verdict!;
  console.log(
    `${result.id} → ${verdict.thumb}` +
      `${verdict.tags.length ? ` (${verdict.tags.join(", ")})` : ""}. Ledger rewritten.`,
  );
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
