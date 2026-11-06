import { useState } from "react";
import { redirect, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import QueueCard, { type QueueActionLabels, type QueueEffect } from "@/components/review/QueueCard";
import { SIMULATED_OUTBOX_NOTE } from "../../server/lib/effects.js";

export { SIMULATED_OUTBOX_NOTE };

/**
 * Queue action copy. Single-sourced in the loader (not in the components)
 * so the SSR HTML stream already carries the exact `Approve` / `Reject`
 * strings without JS — the same contract the live-feed steer panel keeps.
 */
export const QUEUE_ACTION_LABELS: QueueActionLabels & { approveSelected: string } = {
  approve: "Approve",
  editApprove: "Edit & approve",
  reject: "Reject",
  approveSelected: "Approve selected",
};

export function meta() {
  return [{ title: "Review Queue" }];
}

interface ReviewLoaderData {
  pending: QueueEffect[];
  decided: QueueEffect[];
  labels: typeof QUEUE_ACTION_LABELS;
  error: string | null;
}

function isQueueEffect(value: unknown): value is QueueEffect {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  const payload = row.payload as Record<string, unknown> | undefined;
  return (
    typeof row.id === "string" &&
    typeof row.status === "string" &&
    typeof row.to === "string" &&
    !!payload &&
    typeof payload.to === "string" &&
    typeof payload.subject === "string" &&
    typeof payload.body === "string"
  );
}

/**
 * SSR-first queue read: the loader fetches the whole queue over same-origin
 * HTTP (forwarding the viewer's credentials) so the first paint already
 * contains every pending card plus decided status text. Auth failures send
 * the viewer back to sign-in; any other fetch failure surfaces an explicit
 * `error` signal (rendered inline as a retryable alert) so operators can
 * tell a broken queue from an empty one.
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<ReviewLoaderData> {
  const empty: ReviewLoaderData = {
    pending: [],
    decided: [],
    labels: QUEUE_ACTION_LABELS,
    error: null,
  };
  try {
    const url = new URL("/_agent-native/actions/list-effects", request.url);
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
      return {
        ...empty,
        error: `Couldn't load the review queue (status ${response.status}).`,
      };
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return { ...empty, error: "Couldn't load the review queue." };
    }
    const rows = data;
    const effects = rows.filter(isQueueEffect);
    return {
      pending: effects.filter((row) => row.status === "pending_review"),
      decided: effects.filter((row) => row.status !== "pending_review"),
      labels: QUEUE_ACTION_LABELS,
      error: null,
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return {
      ...empty,
      error: "Couldn't load the review queue.",
    };
  }
}

export default function ReviewRoute() {
  const { pending, decided, labels, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [selected, setSelected] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  function toggleSelect(effectId: string) {
    setSelected((current) =>
      current.includes(effectId)
        ? current.filter((id) => id !== effectId)
        : [...current, effectId],
    );
  }

  function refresh() {
    setSelected([]);
    void revalidator.revalidate();
  }

  async function approveSelected() {
    if (selected.length === 0 || batchBusy) {
      return;
    }
    setBatchBusy(true);
    setBatchError(null);
    try {
      const response = await fetch("/_agent-native/actions/decide-effect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ effectIds: selected, decision: "approve" }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Batch approve failed with ${response.status}`);
      }
      refresh();
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Couldn't approve the selection.");
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Review Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing reaches the outside world until a human approves it here.
        </p>
        <p className="mt-2 inline-flex w-fit rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {SIMULATED_OUTBOX_NOTE}
        </p>
      </header>

      {pending.length > 0 ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {selected.length} of {pending.length} selected
          </p>
          <Button
            type="button"
            size="sm"
            disabled={batchBusy || selected.length === 0}
            onClick={() => void approveSelected()}
          >
            {batchBusy ? "Approving…" : labels.approveSelected}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" size="sm" onClick={() => refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {batchError ? (
        <p role="alert" className="text-sm text-destructive">
          {batchError}
        </p>
      ) : null}

      <section aria-label="Pending review" className="flex flex-col gap-4">
        {pending.length === 0 && !error ? (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">No effects waiting for review.</p>
            </CardContent>
          </Card>
        ) : (
          pending.map((effect) => (
            <QueueCard
              key={effect.id}
              effect={effect}
              labels={labels}
              selected={selected.includes(effect.id)}
              onToggleSelect={toggleSelect}
              onDecided={refresh}
            />
          ))
        )}
      </section>

      {decided.length > 0 ? (
        <section aria-label="Decided" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Decided</h2>
          <ul className="flex flex-col gap-2">
            {decided.map((effect) => (
              <li key={effect.id} className="text-sm">
                {effect.subject || effect.id} — status {effect.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
