/**
 * Print the rhythm-figure shelf — the cell a driving section plays, which is the
 * single biggest reason two pieces do or don't sound like the same song:
 *   npm run figures
 *   npm run figures -- --query "lopsided off-beat"
 *   npm run figures -- --meter 3/4
 * Named flags only (repo convention: no positional arguments).
 */
import { Command } from "commander";
import {
  FIGURES,
  FIGURE_NAMES,
  figureFitsMeter,
  type Figure,
  type FigureName,
} from "../src/engine/figure";
import { COMMON_TIME, validateMeter, type Meter } from "../src/utils/timing";

/** `FIGURES` keeps its keys as literal types; reading a value wants the interface. */
const figureOf = (name: FigureName): Figure => FIGURES[name];

const program = new Command();
program
  .name("figures")
  .description("List the rhythm figures a plan section can name in its `figure` field")
  .option("--query <words>", "only figures whose name or summary matches these words")
  .option("--meter <beats/unit>", "only figures that state a whole bar of this meter, e.g. 3/4")
  .parse(process.argv);

const { query, meter: meterFlag } = program.opts<{ query?: string; meter?: string }>();
const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
const meter = parseMeter(meterFlag);

// Terms are alternatives and more matches ranks higher, so a scene sentence
// works better than one keyword — same rule as `voice:find`.
const scored = FIGURE_NAMES.filter((name) => figureFitsMeter(name, meter))
  .map((name) => ({ name, score: scoreOf(name) }))
  .filter(({ score }) => terms.length === 0 || score > 0)
  .sort((a, b) => b.score - a.score);

if (scored.length === 0) {
  const inMeter = `in ${meter[0]}/${meter[1]}`;
  console.error(
    query
      ? `No figure ${inMeter} matches "${query}". Run without --query to see them all.`
      : `No figure states a whole bar ${inMeter} — write one inline in the plan.`,
  );
  process.exit(2);
}

for (const { name } of scored) {
  const { steps, resolution, duration, summary } = figureOf(name);
  const grid = resolution === 3 ? "eighth triplets" : "sixteenths";
  console.log(`\n${name}`);
  console.log(`  ${steps}   (${grid}${duration ? `, ${duration} hits` : ""})`);
  console.log(`  ${summary}`);
}
console.log(`\nUse in a plan: { "style": "riff", "figure": "${scored[0]!.name}", ... }\n`);

/** `--meter 6/8` → `[6, 8]`. A bad one fails here rather than as a wrong bar line. */
function parseMeter(flag: string | undefined): Meter {
  if (!flag) return COMMON_TIME;
  const parts = flag.split("/").map(Number);
  const issues = validateMeter(parts);
  if (issues.length > 0) {
    console.error(`--meter "${flag}" is not a time signature (want e.g. 4/4, 3/4, 6/8)`);
    for (const i of issues) console.error(`  ${i.message}`);
    process.exit(2);
  }
  return [parts[0]!, parts[1]!];
}

function scoreOf(name: FigureName): number {
  const haystack = `${name} ${figureOf(name).summary}`.toLowerCase();
  return terms.filter((t) => haystack.includes(t)).length;
}
