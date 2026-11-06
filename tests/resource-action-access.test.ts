import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanResourceActionAccess } from "@agent-native/core/guards";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("resource-action-access guard", () => {
  it("reports no resource-action-access warnings", () => {
    const result = scanResourceActionAccess({ root });
    expect(result.warnings).toEqual([]);
  });
});
