import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import listJobs from "../../actions/list-jobs.js";

export function meta() {
  return [{ title: "Jobs" }];
}

export interface JobsLoaderJob {
  id: string;
  title: string;
  state: string;
  updatedAt: string;
}

interface JobsLoaderData {
  jobs: JobsLoaderJob[];
}

function isJobsRow(value: unknown): value is JobsLoaderJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.state === "string"
  );
}

/**
 * SSR-first jobs read through the list-jobs action itself (the same query
 * the HTTP surface serves): loaders in this framework build never see
 * request cookies, so a same-origin HTTP self-fetch always 401'd in
 * production and bounced signed-in viewers to the placeholder. Auth stays
 * enforced upstream — the framework workspace guard redirects signed-out
 * document loads to sign-in before this loader runs. Any other failure
 * degrades to an empty board that the client refresh converges on.
 */
export async function loader(): Promise<JobsLoaderData> {
  try {
    const rows = await listJobs.run({ limit: 50 });
    return { jobs: rows.filter(isJobsRow) };
  } catch {
    return { jobs: [] };
  }
}

async function postCreateJob(title: string): Promise<void> {
  const response = await fetch("/_agent-native/actions/create-job", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: "chase-up", title }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Create failed with ${response.status}`);
  }
}

export default function JobsBoard() {
  const { jobs } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postCreateJob(trimmed);
      setTitle("");
      void revalidator.revalidate();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Couldn't create the job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Jobs board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every job with its lifecycle state. New jobs start from the chase-up template.
        </p>
      </header>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={(event) => void create(event)} className="flex flex-col gap-3">
            <label htmlFor="job-title" className="text-sm font-medium">
              Job title
            </label>
            <input
              id="job-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Chase-up sweep"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={busy || title.trim().length === 0}>
                {busy ? "Creating…" : "New job"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section aria-label="Jobs" className="flex flex-col gap-4">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">No jobs yet. Create one to begin.</p>
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => (
            <Card key={job.id} data-job-id={job.id}>
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <Link to={`/jobs/${job.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                  {job.title}
                </Link>
                <p className="rounded-full border px-3 py-1 text-xs">State: {job.state}</p>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
