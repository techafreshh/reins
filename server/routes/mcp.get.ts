import { defineEventHandler } from "h3";

// Public MCP catalog for `GET /mcp`. Static JSON: one `{ name, description }`
// entry per agent-tool action, descriptions copied verbatim from each
// action's `description`. Human-only actions (`decide_effect`,
// `execute_approved_effect`, `update_policy`, `resolve_learning`),
// `http: false` actions, and `run.ts` are intentionally absent. This module
// is the single source of truth: `server/routes/mcp.get.ts` serves it as a
// scanned route, and `server/plugins/mcp-catalog.ts` mounts the same
// handler ahead of the framework's authenticated `use("/mcp")` prefix
// mount (which otherwise shadows scanned routes), so exact-path GETs get
// the catalog while POST /mcp still reaches the framework handshake.
export default defineEventHandler(() => ({
  name: "reins",
  description: "Reins agent-native app MCP catalog",
  tools: [
    { name: "advance_job", description: "Move a job to its next lifecycle state." },
    {
      name: "assign_task",
      description: "Assign a follow-up card to the Drafter or Tracker agent thread.",
    },
    { name: "create_job", description: "Create a chase-up job in planning." },
    {
      name: "get_job_feed",
      description: "Read a job's live orchestrator log plus Drafter/Tracker agent cards.",
    },
    { name: "get_job_state", description: "Read a job's current lifecycle state." },
    {
      name: "get_policy",
      description: "Read the per-capability trust levels and the global kill switch.",
    },
    { name: "hello", description: "Return a friendly greeting." },
    {
      name: "list_effects",
      description: "List proposed effects newest-first, optionally filtered.",
    },
    {
      name: "list_jobs",
      description: "List jobs newest-first, optionally filtered by state.",
    },
    {
      name: "list_learnings",
      description: "List learning proposals newest-first, optionally filtered by job or status.",
    },
    {
      name: "list_threads",
      description:
        "List the demo stakeholder threads ordered by id, with staleness and flag fields.",
    },
    {
      name: "propose_effect",
      description: "Propose an outward effect for human review. It stays pending until decided.",
    },
    {
      name: "propose_learning",
      description:
        "Propose a skill/rule diff from a rejected effect's feedback. Creates a pending learning for human review.",
    },
    {
      name: "steer_job",
      description: "Append a steering instruction; running jobs stay running.",
    },
  ],
}));
