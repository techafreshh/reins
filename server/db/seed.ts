import { closeDbExec } from "@agent-native/core/db";
import { loadEnv } from "@agent-native/core/scripts";

import { seedDemo } from "../lib/demo.js";

loadEnv();

async function main(): Promise<void> {
  // `--demo` is a no-op alias kept for the issue's `--demo` spelling.
  const force = process.argv.includes("--force");

  const result = await seedDemo({ force });
  console.log(JSON.stringify({ threads: result.threads, jobId: result.jobId }));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDbExec();
}
