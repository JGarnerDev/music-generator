/**
 * Print the rhythm-figure shelf — the cell a driving section plays, which is the
 * single biggest reason two pieces do or don't sound like the same song:
 *   npm run figures
 *   npm run figures -- --query "lopsided off-beat"
 * Named flags only (repo convention: no positional arguments).
 */
import { Command } from "commander";
import { FIGURES, FIGURE_NAMES, type Figure, type FigureName } from "../src/engine/figure";

/** `FIGURES` keeps its keys as literal types; reading a value wants the interface. */
const figureOf = (name: FigureName): Figure => FIGURES[name];

const program = new Command();
program
  .name("figures")
  .description("List the rhythm figures a plan section can name in its `figure` field")
  .option("--query <words>", "only figures whose name or summary matches these words")
  .parse(process.argv);

const { query } = program.opts<{ query?: string }>();
const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);

// Terms are alternatives and more matches ranks higher, so a scene sentence
// works better than one keyword — same rule as `voice:find`.
const scored = FIGURE_NAMES.map((name) => ({ name, score: scoreOf(name) }))
  .filter(({ score }) => terms.length === 0 || score > 0)
  .sort((a, b) => b.score - a.score);

if (scored.length === 0) {
  console.error(`No figure matches "${query}". Run without --query to see all ${FIGURE_NAMES.length}.`);
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

function scoreOf(name: FigureName): number {
  const haystack = `${name} ${figureOf(name).summary}`.toLowerCase();
  return terms.filter((t) => haystack.includes(t)).length;
}
