import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
  useDbSync,
} from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLoaderData, useParams, type LoaderFunctionArgs } from "react-router";
import getJobState from "../../actions/get-job-state.js";
import digestCompletedJob from "../../actions/digest-completed-job.js";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SteerBar, { STEER_PLACEHOLDER, STEER_SUGGESTIONS } from "@/components/jobs/SteerBar";
import JobDigest, { type JobDigestData } from "@/components/jobs/JobDigest";

export function meta() {
  return [{ title: "Live feed" }];
}

interface SsrAuditRow {
  kind: string;
  payload: string;
  createdAt: string;
}

interface SsrJobState {
  id: string;
  title: string;
  state: string;
  audit: SsrAuditRow[];
}

/**
 * Static display contract for the live feed page. The returned strings are
 * rendered as the page heading and agent column titles, and React Router
 * serializes loader data into the SSR HTML stream — so a plain `GET`
 * of this page contains the exact `Live feed`, `Drafter`, and `Tracker`
 * strings even before client hydration.
 *
 * The loader also best-effort reads the job's state (including its
 * `steer` audit rows) directly through the get-job-state action — loaders
 * never see request cookies in this framework build, so a same-origin
 * self-fetch always 401'd in production — so a plain `GET` of a steered
 * job already contains the steering instruction text and its
 * `Steering acknowledged — plan recalibrated` confirmation without JS.
 * Failures degrade to `initial: null`; the client queries below converge
 * on the same data within one poll interval.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = params.id ?? "";
  let initial: SsrJobState | null = null;
  let digest: JobDigestData | null = null;
  if (jobId) {
    try {
      const data = await getJobState.run({ id: jobId });
      initial = {
        id: data.id,
        title: typeof data.title === "string" ? data.title : "",
        state: typeof data.state === "string" ? data.state : "",
        audit: data.audit.filter(
          (row) => row && typeof row.kind === "string" && typeof row.payload === "string",
        ),
      };
    } catch {
      initial = null;
    }
    // Read-only end-of-job roundup: the digest never writes, so it is safe
    // to fetch on every paint from any state. Failures degrade to null
    // and the agent columns below still render.
    try {
      digest = await digestCompletedJob.run({ jobId });
    } catch {
      digest = null;
    }
  }
  // The steering panel copy is single-sourced here (the same values the
  // SteerBar renders) so the SSR HTML stream carries the exact panel
  // strings and confirmations without JS — mirroring how `heading` and
  // `agents` already serve the #6 feed contract.
  return {
    heading: "Live feed",
    agents: ["Drafter", "Tracker"] as const,
    jobId,
    initial,
    digest,
    steerPanel: {
      placeholder: STEER_PLACEHOLDER,
      suggestions: [...STEER_SUGGESTIONS],
      confirmation: STEER_CONFIRMATION,
      confirmations: steeringConfirmations(initial?.audit),
    },
  };
}

/** The confirmation line shown under the live feed for each steering. */
const STEER_CONFIRMATION = "Steering acknowledged — plan recalibrated";

/** Extract steering confirmations from `steer` audit rows, oldest first. */
function steeringConfirmations(audit: SsrAuditRow[] | undefined): string[] {
  if (!audit) {
    return [];
  }
  const out: string[] = [];
  for (const row of audit) {
    if (row.kind !== "steer") {
      continue;
    }
    try {
      const payload = JSON.parse(row.payload) as { instruction?: unknown };
      if (typeof payload.instruction === "string" && payload.instruction.length > 0) {
        out.push(payload.instruction);
      }
    } catch {
      // Malformed payloads never break the feed.
    }
  }
  return out;
}

interface FeedCard {
  id: string;
  role: string;
  body: string;
  seq: number;
}

interface AgentFeeds {
  drafter: FeedCard[];
  tracker: FeedCard[];
}

interface DisplayCard {
  id: string;
  agent: string;
  body: string;
  seq: number;
}

function AgentColumn({
  title,
  cards,
  emptyHint,
}: {
  title: string;
  cards: FeedCard[];
  emptyHint: string;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          cards.map((card) => (
            <Card key={card.id}>
              <CardContent className="pt-4">
                <p className="text-sm">{card.body}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}

export default function JobFeedRoute() {
  const { id } = useParams();
  const jobId = id ?? "";
  const queryClient = useQueryClient();
  useDbSync({
    queryClient,
    realtime: {
      reason:
        "a running job's orchestrator and Drafter/Tracker feed changes without the viewer acting",
    },
  });

  const stateQuery = useActionQuery("get-job-state", { id: jobId }, { enabled: Boolean(jobId), refetchInterval: 5000 });
  const feedQuery = useActionQuery(
    "get-job-feed",
    { id: jobId },
    { enabled: Boolean(jobId), refetchInterval: 5000 },
  );
  const assign = useActionMutation("assign-task");

  const display = useLoaderData<typeof loader>();
  const [agent, setAgent] = useState<"drafter" | "tracker">("drafter");
  const [task, setTask] = useState("");

  const state = (stateQuery.data ?? null) as {
    id: string;
    title: string;
    state: string;
    message: string;
    audit?: SsrAuditRow[];
  } | null;
  const feed = (feedQuery.data ?? null) as {
    id: string;
    title: string;
    state: string;
    log: FeedCard[];
    agents: AgentFeeds;
    cards: DisplayCard[];
  } | null;

  const log = feed?.log ?? [];
  const agents: AgentFeeds = feed?.agents ?? { drafter: [], tracker: [] };
  // Live steering confirmations converge via the polling state query;
  // the SSR loader data covers the first paint without JS.
  const liveSteering = steeringConfirmations(state?.audit);
  const steering = liveSteering.length > 0 || stateQuery.data ? liveSteering : display.steerPanel.confirmations;

  function submitAssign(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = task.trim();
    if (!jobId || !trimmed || assign.isPending) {
      return;
    }
    assign.mutate(
      { jobId, agent, task: trimmed },
      {
        onSuccess: () => {
          setTask("");
          toast.success(`Task assigned to ${agent === "drafter" ? "Drafter" : "Tracker"}`);
        },
        onError: (error) => {
          toast.error(actionErrorMessage(error) ?? "Couldn't assign the task.");
        },
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {state?.title ?? feed?.title ?? display.initial?.title ?? (stateQuery.isLoading ? "Loading job…" : "Job")}
        </p>
        <h1 className="text-2xl font-bold">{display.heading}</h1>
        {state?.state ?? display.initial?.state ? (
          <p className="mt-1 text-sm text-muted-foreground">State: {state?.state ?? display.initial?.state}</p>
        ) : null}
        {stateQuery.isError && !display.initial ? (
          <p className="mt-1 text-sm text-destructive">
            {actionErrorMessage(stateQuery.error) ?? "Couldn't load the job."}
          </p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Orchestrator log</CardTitle>
        </CardHeader>
        <CardContent>
          {feedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading feed…</p>
          ) : feedQuery.isError ? (
            <p className="text-sm text-destructive">
              {actionErrorMessage(feedQuery.error) ?? "Couldn't load the feed."}
            </p>
          ) : log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orchestrator activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {log.map((entry) => (
                <li key={entry.id} className="text-sm">
                  {entry.body}
                </li>
              ))}
            </ul>
          )}
          {steering.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 border-t pt-3">
              {steering.map((instruction, index) => (
                <li key={`${index}-${instruction}`} className="text-sm">
                  <span className="font-medium">{display.steerPanel.confirmation}: </span>
                  {instruction}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <JobDigest digest={display.digest} />

      <div className="grid gap-6 md:grid-cols-2">
        <AgentColumn title={display.agents[0]} cards={agents.drafter} emptyHint="No Drafter cards yet." />
        <AgentColumn title={display.agents[1]} cards={agents.tracker} emptyHint="No Tracker cards yet." />
      </div>

      <SteerBar
        jobId={display.jobId || jobId}
        placeholder={display.steerPanel.placeholder}
        suggestions={display.steerPanel.suggestions}
      />

      <Card>
        <CardHeader>
          <CardTitle>Assign a task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitAssign} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-assign-agent">Agent</Label>
              <select
                id="job-assign-agent"
                value={agent}
                onChange={(event) => setAgent(event.target.value as "drafter" | "tracker")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="drafter">Drafter</option>
                <option value="tracker">Tracker</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-assign-task">Task</Label>
              <Input
                id="job-assign-task"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="draft follow-up"
              />
            </div>
            {assign.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionErrorMessage(assign.error) ?? "Couldn't assign the task."}
              </p>
            ) : null}
            <Button type="submit" disabled={assign.isPending || task.trim().length === 0}>
              {assign.isPending ? "Assigning…" : "Assign task"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
