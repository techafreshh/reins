import { useState } from "react";
import { redirect, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
 * SSR-first jobs read: the loader fetches the whole jobs list over
 * same-origin HTTP (forwarding the viewer's credentials) so the first
 * paint already carries every job card plus its state badge. Auth failures
 * send the viewer back to sign-in; any other fetch failure degrades to an
 * empty board that the client refresh converges on.
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<JobsLoaderData> {
  const empty: JobsLoaderData = { jobs: [] };
  try {
    const url = new URL("/_agent-native/actions/list-jobs", request.url);
    const headers: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.cookie = cookie;
    }
    const authorization = request.headers.get("authorization");
    if (authorization) {
      headers.authorization = authorization;
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401) {
      throw redirect("/");
    }
    if (!response.ok) {
      return empty;
    }
    const data: unknown = await response.json();
    const rows = Array.isArray(data) ? data : [];
    return { jobs: rows.filter(isJobsRow) };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return empty;
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

export default function JobsRoute() {
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
                <div>
                  <p className="text-sm font-medium">{job.title}</p>
                  <p className="text-xs text-muted-foreground">{job.id}</p>
                </div>
                <p className="rounded-full border px-3 py-1 text-xs">State: {job.state}</p>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
