import { useEffect, useState } from "react";

import SkillDiffCard from "@/components/learning/SkillDiffCard";

export function meta() {
  return [{ title: "Learnings" }];
}

interface LearningEntry {
  id: string;
  jobId: string;
  rule: string;
  fromEffectId: string;
  status: string;
  updatedAt: string;
}

async function postResolution(learningId: string, resolution: "approved" | "rejected") {
  const response = await fetch("/_agent-native/actions/resolve_learning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ learningId, resolution }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Resolve failed with ${response.status}`);
  }
}

export default function LearningsRoute() {
  const [rows, setRows] = useState<LearningEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/_agent-native/actions/list_learnings");
      if (!response.ok) {
        throw new Error(`List failed with ${response.status}`);
      }
      const data: unknown = await response.json();
      setRows(Array.isArray(data) ? (data as LearningEntry[]) : []);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "Couldn't load learnings.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function resolve(learningId: string, resolution: "approved" | "rejected") {
    try {
      await postResolution(learningId, resolution);
      await refresh();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : "Couldn't record the decision.",
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Learnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rule proposals learned from rejected drafts. Approving one rewrites the next draft.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <section aria-label="Proposed rules" className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No learnings proposed yet.</p>
        ) : (
          rows.map((row) => (
            <SkillDiffCard
              key={row.id}
              rule={row.rule}
              fromEffectId={row.fromEffectId}
              status={row.status}
              currentExcerpt={`Pre-rule draft phrasing for job ${row.jobId}.`}
              onApprove={() => void resolve(row.id, "approved")}
              onReject={() => void resolve(row.id, "rejected")}
            />
          ))
        )}
      </section>
    </div>
  );
}
