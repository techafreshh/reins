import { actionErrorMessage, useActionMutation } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const STEER_PLACEHOLDER = "Steer this job";
export const STEER_SUGGESTIONS = ["widen scope", "budget: 3 emails max"] as const;

export default function SteerBar({
  jobId,
  placeholder = STEER_PLACEHOLDER,
  suggestions = STEER_SUGGESTIONS,
}: {
  jobId: string;
  placeholder?: string;
  suggestions?: readonly string[];
}) {
  const [instruction, setInstruction] = useState("");
  const steer = useActionMutation("steer-job");

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = instruction.trim();
    if (!jobId || !trimmed || steer.isPending) {
      return;
    }
    steer.mutate(
      { jobId, instruction: trimmed },
      {
        onSuccess: () => {
          setInstruction("");
          toast.success("Steering acknowledged — plan recalibrated");
        },
        onError: (error) => {
          toast.error(actionErrorMessage(error) ?? "Couldn't steer the job.");
        },
      },
    );
  }

  function submitChip(chip: string) {
    if (!jobId || steer.isPending) {
      return;
    }
    setInstruction(chip);
    steer.mutate(
      { jobId, instruction: chip },
      {
        onSuccess: () => {
          setInstruction("");
          toast.success("Steering acknowledged — plan recalibrated");
        },
        onError: (error) => {
          toast.error(actionErrorMessage(error) ?? "Couldn't steer the job.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steer this job</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={placeholder}
            aria-label={STEER_PLACEHOLDER}
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((chip) => (
              <Button
                key={chip}
                type="button"
                variant="outline"
                size="sm"
                disabled={steer.isPending || !jobId}
                onClick={() => submitChip(chip)}
              >
                {chip}
              </Button>
            ))}
          </div>
          {steer.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {actionErrorMessage(steer.error) ?? "Couldn't steer the job."}
            </p>
          ) : null}
          <Button type="submit" disabled={steer.isPending || instruction.trim().length === 0}>
            {steer.isPending ? "Steering…" : "Steer job"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
