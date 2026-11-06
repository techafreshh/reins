import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import advanceJob from "../actions/advance-job.js";
import advance_job from "../actions/advance_job.js";
import assignTask from "../actions/assign-task.js";
import assign_task from "../actions/assign_task.js";
import createJob from "../actions/create-job.js";
import create_job from "../actions/create_job.js";
import decideEffect from "../actions/decide-effect.js";
import decide_effect from "../actions/decide_effect.js";
import digestCompletedJob from "../actions/digest-completed-job.js";
import digest_completed_job from "../actions/digest_completed_job.js";
import executeApprovedEffect from "../actions/execute-approved-effect.js";
import execute_approved_effect from "../actions/execute_approved_effect.js";
import getJobFeed from "../actions/get-job-feed.js";
import get_job_feed from "../actions/get_job_feed.js";
import getJobState from "../actions/get-job-state.js";
import get_job_state from "../actions/get_job_state.js";
import getPolicy from "../actions/get-policy.js";
import get_policy from "../actions/get_policy.js";
import listAudit from "../actions/list-audit.js";
import list_audit from "../actions/list_audit.js";
import listEffects from "../actions/list-effects.js";
import list_effects from "../actions/list_effects.js";
import listJobs from "../actions/list-jobs.js";
import list_jobs from "../actions/list_jobs.js";
import listLearnings from "../actions/list-learnings.js";
import list_learnings from "../actions/list_learnings.js";
import listThreads from "../actions/list-threads.js";
import list_threads from "../actions/list_threads.js";
import proposeEffect from "../actions/propose-effect.js";
import propose_effect from "../actions/propose_effect.js";
import proposeLearning from "../actions/propose-learning.js";
import propose_learning from "../actions/propose_learning.js";
import resolveLearning from "../actions/resolve-learning.js";
import resolve_learning from "../actions/resolve_learning.js";
import steerJob from "../actions/steer-job.js";
import steer_job from "../actions/steer_job.js";
import updatePolicy from "../actions/update-policy.js";
import update_policy from "../actions/update_policy.js";
import { resolveCliActionName } from "../server/lib/cli-action-names.js";

const actionsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../actions");

const KEBAB_FILE = /^[a-z][a-z0-9-]*\.ts$/;

interface ActionPair {
  snake: string;
  canonical: unknown;
  alias: unknown;
}

// One entry per legacy snake_case HTTP alias and its kebab-case canonical.
const PAIRS: ActionPair[] = [
  { snake: "advance_job", canonical: advanceJob, alias: advance_job },
  { snake: "assign_task", canonical: assignTask, alias: assign_task },
  { snake: "create_job", canonical: createJob, alias: create_job },
  { snake: "decide_effect", canonical: decideEffect, alias: decide_effect },
  { snake: "digest_completed_job", canonical: digestCompletedJob, alias: digest_completed_job },
  {
    snake: "execute_approved_effect",
    canonical: executeApprovedEffect,
    alias: execute_approved_effect,
  },
  { snake: "get_job_feed", canonical: getJobFeed, alias: get_job_feed },
  { snake: "get_job_state", canonical: getJobState, alias: get_job_state },
  { snake: "get_policy", canonical: getPolicy, alias: get_policy },
  { snake: "list_audit", canonical: listAudit, alias: list_audit },
  { snake: "list_effects", canonical: listEffects, alias: list_effects },
  { snake: "list_jobs", canonical: listJobs, alias: list_jobs },
  { snake: "list_learnings", canonical: listLearnings, alias: list_learnings },
  { snake: "list_threads", canonical: listThreads, alias: list_threads },
  { snake: "propose_effect", canonical: proposeEffect, alias: propose_effect },
  { snake: "propose_learning", canonical: proposeLearning, alias: propose_learning },
  { snake: "resolve_learning", canonical: resolveLearning, alias: resolve_learning },
  { snake: "steer_job", canonical: steerJob, alias: steer_job },
  { snake: "update_policy", canonical: updatePolicy, alias: update_policy },
];

function realHasKebabFile(kebab: string): boolean {
  return existsSync(path.join(actionsDir, `${kebab}.ts`));
}

describe("action filename charset", () => {
  it("keeps kebab-case canonical files with only the known snake_case aliases", () => {
    const files = readdirSync(actionsDir).filter((f) => f.endsWith(".ts"));
    expect(files).toContain("run.ts");
    const snake = files.filter((f) => f !== "run.ts" && !KEBAB_FILE.test(f)).sort();
    expect(snake).toEqual(PAIRS.map((p) => `${p.snake}.ts`).sort());
    for (const { snake: sn, canonical } of PAIRS) {
      expect(sn).not.toContain("-");
      expect(canonical).toBeDefined();
    }
  });

  it.each(PAIRS)("$snake delegates to its kebab canonical and stays hidden", ({ canonical, alias }) => {
    const canonicalEntry = canonical as Record<string, unknown>;
    const aliasEntry = alias as Record<string, unknown>;
    expect(aliasEntry.agentTool).toBe(false);
    expect(aliasEntry.mcpTool).toBe(false);
    expect(aliasEntry.run).toBe(canonicalEntry.run);
    expect(aliasEntry.schema).toBe(canonicalEntry.schema);
    expect(aliasEntry.http).toBe(canonicalEntry.http);
    expect(aliasEntry.description).toBe(canonicalEntry.description);
  });

  it("rewrites snake_case CLI names to kebab files", () => {
    expect(resolveCliActionName("list_threads", () => true)).toBe("list-threads");
    expect(resolveCliActionName("list_threads", () => false)).toBe("list_threads");
    expect(resolveCliActionName("list-threads", () => true)).toBe("list-threads");
    expect(resolveCliActionName("--help", () => true)).toBe("--help");
    expect(resolveCliActionName("hello", () => true)).toBe("hello");
    expect(resolveCliActionName(undefined, () => true)).toBe(undefined);
  });

  it("maps against the real actions directory", () => {
    expect(resolveCliActionName("list_threads", realHasKebabFile)).toBe("list-threads");
    expect(resolveCliActionName("create_job", realHasKebabFile)).toBe("create-job");
    expect(resolveCliActionName("list-threads", realHasKebabFile)).toBe("list-threads");
    expect(resolveCliActionName("no_such_action", realHasKebabFile)).toBe("no_such_action");
  });
});
