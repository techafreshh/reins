import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendFollowupPayloadSchema } from "../../../server/lib/effects.js";

export interface QueueEffect {
  id: string;
  jobId: string;
  capability: string;
  status: string;
  payload: { threadId: string; to: string; subject: string; body: string };
  to: string;
  subject: string;
  updatedAt: string;
}

/** Button copy single-sourced from the review route loader (see `review.tsx`). */
export interface QueueActionLabels {
  approve: string;
  editApprove: string;
  reject: string;
}

interface QueueCardProps {
  effect: QueueEffect;
  labels: QueueActionLabels;
  selected: boolean;
  onToggleSelect: (effectId: string) => void;
  onDecided: () => void;
}

async function postDecision(body: Record<string, unknown>): Promise<void> {
  const response = await fetch("/_agent-native/actions/decide-effect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Decision failed with ${response.status}`);
  }
}

/** One editable review card: the reviewer edits to/subject/body in place. */
export default function QueueCard({ effect, labels, selected, onToggleSelect, onDecided }: QueueCardProps) {
  const [to, setTo] = useState(effect.payload.to);
  const [subject, setSubject] = useState(effect.payload.subject);
  const [body, setBody] = useState(effect.payload.body);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approve" | "edit-approve" | "reject") {
    if (busy) {
      return;
    }
    if (decision === "reject" && !feedback.trim()) {
      setHint("feedback: Required");
      return;
    }
    const parsed =
      decision === "edit-approve"
        ? sendFollowupPayloadSchema.safeParse({
            threadId: effect.payload.threadId,
            to: to.trim(),
            subject: subject.trim(),
            body: body.trim(),
          })
        : null;
    if (parsed && !parsed.success) {
      setHint("Edits must keep a valid to address, subject, and body.");
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      await postDecision({
        effectId: effect.id,
        decision,
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
        ...(decision === "edit-approve"
          ? { edits: { to: to.trim(), subject: subject.trim(), body: body.trim() } }
          : {}),
      });
      onDecided();
    } catch (error) {
      setHint(error instanceof Error ? error.message : "Couldn't record the decision.");
    } finally {
      setBusy(false);
    }
  }

  const decided = effect.status !== "pending_review";

  return (
    <Card data-effect-id={effect.id}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={decided}
            onChange={() => onToggleSelect(effect.id)}
            aria-label={`Select ${effect.id}`}
          />
          <CardTitle className="text-base">{effect.subject || effect.id}</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">{effect.status}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${effect.id}-to`}>To</Label>
          <Input
            id={`${effect.id}-to`}
            value={to}
            disabled={decided}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${effect.id}-subject`}>Subject</Label>
          <Input
            id={`${effect.id}-subject`}
            value={subject}
            disabled={decided}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${effect.id}-body`}>Body</Label>
          <textarea
            id={`${effect.id}-body`}
            value={body}
            disabled={decided}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${effect.id}-feedback`}>Feedback</Label>
          <textarea
            id={`${effect.id}-feedback`}
            value={feedback}
            disabled={decided}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Required to reject"
            rows={2}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {hint ? (
          <p role="alert" className="text-sm text-destructive">
            {hint}
          </p>
        ) : null}
        {!decided ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void decide("approve")}>
              {labels.approve}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void decide("edit-approve")}
            >
              {labels.editApprove}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void decide("reject")}
            >
              {labels.reject}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
