import { describe, expect, it } from "vitest";

import handler from "../server/routes/mcp.get";

describe("GET /mcp catalog", () => {
  it("lists tools containing create_job and steer_job", async () => {
    const body = (await (handler as unknown as () => unknown)()) as {
      tools: { name: string; description: string }[];
    };
    expect(Array.isArray(body.tools)).toBe(true);
    const names = body.tools.map((t) => t.name);
    expect(names).toContain("create_job");
    expect(names).toContain("steer_job");
    expect(names.length).toBeGreaterThanOrEqual(14);
  });
});
