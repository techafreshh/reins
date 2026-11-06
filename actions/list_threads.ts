import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listDemoThreads } from "../server/lib/demo.js";

export default defineAction({
  description: "List the demo stakeholder threads ordered by id, with staleness and flag fields.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    return await listDemoThreads();
  },
});
