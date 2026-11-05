import { describe, expect, it } from "vitest";

import handler from "../server/routes/api/health.get";

describe("GET /api/health", () => {
  it("returns exactly { status: 'ok', skeleton: true }", async () => {
    const body = await (handler as unknown as () => unknown)();
    expect(body).toEqual({ status: "ok", skeleton: true });
  });
});
