/**
 * Keep `compositions/` filed by kind — one folder per tab in the bench.
 *   npm run compositions:organize                 # dry run: what would move, what's broken
 *   npm run compositions:organize -- --apply      # file loose root files by shape
 *   npm run compositions:organize -- --file compositions/segments/ashen-king.json \
 *       --kind leitmotifs --apply                 # promote one piece to another kind
 *
 * Kind is the folder, so "reclassify" literally means "move the file". Doing it
 * here (instead of by hand) keeps the id in the bench, the path on disk and the
 * `motifs` links pointing at each other.
 *
 * Named flags only (repo convention: no positional arguments).
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { Command } from "commander";
import {
  COMPOSITION_KINDS,
  danglingMotifs,
  inferKind,
  isCompositionKind,
  kindFromPath,
  type CompositionKind,
} from "../src/engine/library";
import { loadLibraryFromDir } from "../src/engine/library-loader";

const program = new Command();
program
  .name("organize-compositions")
  .description("File compositions into their kind folders (segments/loops/songs/leitmotifs)")
  .option("--apply", "actually move files (default: dry run)", false)
  .option("--file <path>", "reclassify a single composition instead of sweeping loose files")
  .option("--kind <kind>", `target kind for --file: ${COMPOSITION_KINDS.join(" | ")}`)
  .parse(process.argv);

const opts = program.opts<{ apply: boolean; file?: string; kind?: string }>();
const dir = resolve(process.cwd(), "compositions");
if (!existsSync(dir)) {
  console.error(`No compositions/ directory at ${dir}.`);
  process.exit(2);
}

/** Every kind folder exists up front so the bench shows an empty tab, not a missing one. */
for (const kind of COMPOSITION_KINDS) mkdirSync(join(dir, kind), { recursive: true });

const moves = opts.file ? [singleMove(opts.file, opts.kind)] : sweepLooseFiles();

if (moves.length === 0) {
  console.log("Nothing to move — every composition is already filed by kind.");
} else {
  for (const move of moves) {
    console.log(`${opts.apply ? "moved" : "would move"}  ${move.from}  →  ${move.to}`);
    if (opts.apply) {
      const to = resolve(process.cwd(), move.to);
      mkdirSync(dirname(to), { recursive: true });
      renameSync(resolve(process.cwd(), move.from), to);
    }
  }
  if (!opts.apply) console.log(`\n${moves.length} file(s). Re-run with --apply to move them.`);
}

reportDanglingMotifs();

/** Loose `compositions/*.json` at the root, filed by shape (loop window or not). */
function sweepLooseFiles(): { from: string; to: string }[] {
  return loadLibraryFromDir(dir)
    .filter((entry) => kindFromPath(entry.path) === null)
    .map((entry) => ({
      from: entry.path,
      to: `compositions/${inferKind(entry.composition)}/${entry.slug}.json`,
    }));
}

function singleMove(file: string, kind: string | undefined): { from: string; to: string } {
  if (!isCompositionKind(kind)) {
    console.error(`--file needs --kind <${COMPOSITION_KINDS.join("|")}> (got ${kind ?? "nothing"}).`);
    process.exit(2);
  }
  const abs = resolve(process.cwd(), file);
  if (!existsSync(abs)) {
    console.error(`No such composition: ${file}`);
    process.exit(2);
  }
  const target: CompositionKind = kind;
  const to = `compositions/${target}/${basename(abs)}`;
  if (relative(process.cwd(), abs).split(/[\\/]/).join("/") === to) {
    console.error(`${file} is already a ${target} composition.`);
    process.exit(0);
  }
  return { from: file, to };
}

/**
 * A `motifs: [...]` entry naming no file under `leitmotifs/` is a broken quote —
 * the piece claims a theme that doesn't exist. Reported, never fatal, so a
 * planned motif can be referenced before it's written.
 */
function reportDanglingMotifs(): void {
  const dangling = danglingMotifs(loadLibraryFromDir(dir));
  if (dangling.length === 0) return;
  console.log(`\n${dangling.length} unresolved motif reference(s):`);
  for (const { entry, motif } of dangling) {
    console.log(`  ${entry.id} quotes "${motif}" — no compositions/leitmotifs/${motif}.json`);
  }
}
