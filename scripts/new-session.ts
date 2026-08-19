/**
 * Write a session plan — the running order the session board plays from.
 *   npm run session:new -- --name "Session 14" --campaign redwater
 *   npm run session:new -- --name "Session 14" --campaign redwater \
 *     --cues loops/redwater-tavern-raid,leitmotifs/redwater-lioness-motif
 *   npm run session:new -- --name "Session 14" --campaign redwater --append \
 *     --cues segments/aftermath        # add to a plan that already exists
 * Writes sessions/<slug>.json. Named flags only (repo convention: no positional args).
 *
 * The cue ids are library ids — `<kind>/<slug>`, the folder plus the filename.
 * Ones that name no piece are reported but still written: a plan is routinely
 * built before the music is, and the board shows an unwritten cue as missing
 * rather than pretending it is fine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadLibraryFromDir } from "../src/engine/library-loader";
import {
  addCue,
  emptySession,
  renderSessionPlan,
  sessionSlug,
  validateSessionPlan,
  type SessionPlan,
} from "../src/engine/session";

const program = new Command();
program
  .name("new-session")
  .description("Create or extend a sessions/<slug>.json running order")
  .requiredOption("--name <name>", 'session name, e.g. "Session 14 — the ambush"')
  .option("--campaign <slug>", "campaign this session belongs to, e.g. redwater")
  .option("--cues <csv>", "library ids in play order, e.g. loops/tavern,segments/ambush", "")
  .option("--append", "add the cues to an existing plan instead of refusing", false)
  .option("--force", "overwrite an existing plan", false)
  .parse(process.argv);

const opts = program.opts<{
  name: string;
  campaign?: string;
  cues: string;
  append: boolean;
  force: boolean;
}>();

const slug = sessionSlug(opts.name);
if (slug === "") {
  console.error(`--name must contain letters or numbers, got "${opts.name}"`);
  process.exit(2);
}

const dir = resolve(process.cwd(), "sessions");
const file = resolve(dir, `${slug}.json`);
const exists = existsSync(file);
if (exists && !opts.append && !opts.force) {
  console.error(`sessions/${slug}.json already exists. Use --append to add cues, or --force to replace it.`);
  process.exit(2);
}

let plan: SessionPlan = { ...emptySession(slug, opts.campaign), title: opts.name };
if (exists && opts.append) {
  const loaded: unknown = JSON.parse(readFileSync(file, "utf8"));
  const issues = validateSessionPlan(loaded);
  if (issues.length > 0) {
    console.error(`sessions/${slug}.json is not a valid plan:`);
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
    process.exit(1);
  }
  plan = loaded as SessionPlan;
  if (opts.campaign) plan = { ...plan, campaign: opts.campaign };
}

const cues = opts.cues.split(",").map((cue) => cue.trim()).filter(Boolean);
for (const cue of cues) plan = addCue(plan, cue);

// Report cues that name nothing on the shelf — a typo now is a silent gap later.
const library = loadLibraryFromDir(resolve(process.cwd(), "compositions"));
const known = new Set(library.map((entry) => entry.id));
const unknown = plan.cues.map((cue) => cue.entry).filter((id) => !known.has(id));

mkdirSync(dir, { recursive: true });
writeFileSync(file, renderSessionPlan(plan), "utf8");

console.log(`Wrote sessions/${slug}.json — ${plan.cues.length} cue(s).`);
if (unknown.length > 0) {
  console.log(`  ⚠ no such piece yet: ${[...new Set(unknown)].join(", ")}`);
  console.log("    (compose them, or fix the id — the board shows these as missing cues)");
}
console.log("  Open it: npm run dev, then http://localhost:5173/session.html");
