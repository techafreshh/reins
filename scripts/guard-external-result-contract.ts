import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * External-result-contract guard (blocking, exit 1 on violation).
 *
 * External callers (agent loop, MCP, HTTP) consume action results without
 * chat context, so two invariants hold for every externally-exposed action:
 *
 * (a) No wait-for-user phrasing: `description` values and
 *     `nextRequiredAction` literals must not contain wait-language
 *     (`wait(ing) for/on you|the user`, `let me know`, `reply to
 *     continue`, `awaiting your`, `tell me when`), case-insensitive.
 *     A result that asks the caller to wait strands unattended runs.
 * (b) Every `changeResource` action's `outputSchema` shape must contain an
 *     `id` plus a human-readable summary (`message` or `title`), so share
 *     targets and SSE invalidations always have something to point at.
 *
 * Scope: `run.ts`, re-export shims (files without a `defineAction(` call),
 * and files containing `agentTool: false` or `http: false` are skipped —
 * they are human-only or transport-disabled, never externally consumed.
 */

const ACTIONS_DIR = new URL("../actions/", import.meta.url);
const ACTIONS_PATH = ACTIONS_DIR.pathname;

const BANNED: RegExp[] = [
  /wait(ing)?\s+(for|on)\s+(you|the user)/i,
  /let me know/i,
  /reply to continue/i,
  /awaiting your/i,
  /tell me when/i,
];

function isShimOrInternal(source: string, file: string): boolean {
  if (file === "run.ts") return true;
  if (!source.includes("defineAction(")) return true; // re-export shim
  if (/agentTool:\s*false/.test(source)) return true; // human-only
  if (/\bhttp:\s*false/.test(source)) return true; // transport-disabled
  return false;
}

/** Pull `description: "..."` values and `nextRequiredAction: "..."` literals. */
function externalFacingLiterals(source: string): string[] {
  const found: string[] = [];
  const desc = source.match(/description:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/s);
  if (desc?.[1]) found.push(desc[1]);
  for (const m of source.matchAll(/nextRequiredAction:\s*(["'])(.*?)\1/g)) {
    if (m[2] !== undefined) found.push(m[2]);
  }
  return found;
}

function shapeKeys(outputSchema: unknown): string[] {
  if (typeof outputSchema !== "object" || outputSchema === null) return [];
  const shape = (outputSchema as { shape?: unknown }).shape;
  if (typeof shape !== "object" || shape === null) return [];
  return Object.keys(shape as Record<string, unknown>);
}

let failures = 0;

function check(ok: boolean, label: string, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts")).sort();

  // (a) static wait-language scan
  for (const file of files) {
    const source = readFileSync(join(ACTIONS_PATH, file), "utf8");
    if (isShimOrInternal(source, file)) continue;
    const literals = externalFacingLiterals(source);
    const hit = literals.find((text) => BANNED.some((re) => re.test(text)));
    check(!hit, `no-wait-language ${file}`, hit ? `banned phrasing in ${JSON.stringify(hit.slice(0, 80))}` : "");
  }

  // (b) outputSchema shape via tsx import (definition import only: no run())
  for (const file of files) {
    const source = readFileSync(join(ACTIONS_PATH, file), "utf8");
    if (isShimOrInternal(source, file)) continue;
    if (!source.includes("changeResource")) continue;
    const name = file.replace(/\.ts$/, "");
    let keys: string[] = [];
    try {
      const mod = await import(pathToFileURL(join(ACTIONS_PATH, file)).href);
      keys = shapeKeys(mod.default?.outputSchema);
    } catch (error) {
      check(false, `result-contract ${name}`, `import failed: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    check(
      keys.includes("id") && (keys.includes("message") || keys.includes("title")),
      `result-contract ${name}`,
      `outputSchema keys: [${keys.join(", ")}]`,
    );
  }

  if (failures > 0) {
    console.error(`\nguard:external-result-contract: ${failures} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log("\nguard:external-result-contract: all checks passed.");
  }
}

try {
  await main();
} catch (error) {
  console.error(`guard failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
