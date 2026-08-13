/**
 * Validate a composition JSON against the engine contract.
 *   npm run composition:validate -- --file compositions/demo-sad.json
 * Named flags only (repo convention: no positional arguments).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { validateComposition } from "../src/engine/composition";

const program = new Command();
program
  .name("validate-composition")
  .description("Structurally validate a composition JSON file")
  .requiredOption("--file <path>", "path to the composition .json")
  .parse(process.argv);

const { file } = program.opts<{ file: string }>();
const abs = resolve(process.cwd(), file);

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(abs, "utf8"));
} catch (err) {
  console.error(`Could not read/parse ${abs}: ${(err as Error).message}`);
  process.exit(2);
}

const issues = validateComposition(parsed);
if (issues.length === 0) {
  console.log(`OK — ${file} is a valid composition.`);
  process.exit(0);
}
console.error(`INVALID — ${file} has ${issues.length} issue(s):`);
for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
process.exit(1);
