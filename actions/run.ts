import { existsSync } from "node:fs";
import { join } from "node:path";

import { runScript } from "@agent-native/core/scripts";

import { resolveCliActionName } from "../server/lib/cli-action-names.js";

// Spelling shim: the framework CLI regex rejects underscores, so a legacy
// `snake_case` invocation is rewritten to its kebab-case file before the
// framework validates `process.argv[2]`. Unknown names pass through
// untouched so the framework's "not found" behavior is preserved.
const raw = process.argv[2];
if (raw) {
  const mapped = resolveCliActionName(
    raw,
    (kebab) =>
      existsSync(join(process.cwd(), "actions", `${kebab}.ts`)) ||
      existsSync(join(process.cwd(), "scripts", `${kebab}.ts`)),
  );
  if (mapped) {
    process.argv[2] = mapped;
  }
}

void runScript();
