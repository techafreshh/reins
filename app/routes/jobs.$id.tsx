import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
  useDbSync,
} from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function meta() {
  return [{ title: "Job live feed" }];
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

  const stateQuery = useActionQuery("get_job_state", { id: jobId }, { enabled: Boolean(jobId) });
  const feedQuery = useActionQuery(
    "get_job_feed",
    { id: jobId },
    { enabled: Boolean(jobId), refetchInterval: 5000 },
  );
  const assign = useActionMutation("assign_task");

  const [agent, setAgent] = useState<"drafter" | "tracker">("drafter");
  const [task, setTask] = useState("");

  const state = (stateQuery.data ?? null) as {
    id: string;
    title: string;
    state: string;
    message: string;
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
          {state?.title ?? feed?.title ?? (stateQuery.isLoading ? "Loading job…" : "Job")}
        </p>
        <h1 className="text-2xl font-bold">Live feed</h1>
        {state?.state ? (
          <p className="mt-1 text-sm text-muted-foreground">State: {state.state}</p>
        ) : null}
        {stateQuery.isError ? (
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
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <AgentColumn title="Drafter" cards={agents.drafter} emptyHint="No Drafter cards yet." />
        <AgentColumn title="Tracker" cards={agents.tracker} emptyHint="No Tracker cards yet." />
      </div>

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
