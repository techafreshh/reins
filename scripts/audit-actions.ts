import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Advisory inventory of the app-owned action surface.
 *
 * Reads `actions/`, and for every file containing a `defineAction(` call
 * reports the name plus surface flags detected by static text match
 * (`agentTool` / `mcpTool` / `http` / `needsApproval` / `changeResource`
 * presence). Re-export shims (files without a `defineAction(` call) and
 * `run.ts` are skipped. Always exits 0: this is an inventory, not a gate.
 */

const ACTIONS_DIR = new URL("../actions/", import.meta.url);

function flag(source: string, pattern: RegExp): boolean {
  return pattern.test(source);
}

async function main(): Promise<void> {
  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts")).sort();
  let count = 0;
  for (const file of files) {
    if (file === "run.ts") {
      continue;
    }
    const source = readFileSync(join(ACTIONS_DIR.pathname, file), "utf8");
    if (!source.includes("defineAction(")) {
      continue; // re-export shim (e.g. kebab-case alias), not a definition
    }
    const name = file.replace(/\.ts$/, "");
    const flags: string[] = [];
    if (flag(source, /agentTool:\s*false/)) flags.push("agentTool:false");
    if (flag(source, /mcpTool:\s*true/)) flags.push("mcpTool:true");
    if (flag(source, /\bhttp:\s*false/)) flags.push("http:false");
    else if (flag(source, /\bhttp:\s*\{/)) flags.push("http");
    if (flag(source, /needsApproval/)) flags.push("needsApproval");
    if (flag(source, /changeResource/)) flags.push("changeResource");
    count += 1;
    console.log(`- ${name}: ${flags.length > 0 ? flags.join(", ") : "default surface"}`);
  }
  console.log(`\nactions:audit: ${count} defined actions inventoried (advisory, always green).`);
}

try {
  await main();
} catch (error) {
  console.error(`actions:audit failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
