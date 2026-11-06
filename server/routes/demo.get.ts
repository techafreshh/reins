import { defineEventHandler, getQuery } from "h3";

import { seedDemo } from "../lib/demo.js";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const force = query.force === "1" || query.force === "true";

  const result = await seedDemo({ force });
  return { ok: true, threads: result.threads, jobId: result.jobId };
});
