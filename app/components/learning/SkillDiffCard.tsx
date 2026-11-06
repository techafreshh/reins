import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SkillDiffCardProps {
  rule: string;
  fromEffectId: string;
  status: string;
  currentExcerpt: string;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * One rule proposal: the current excerpt (pre-rule draft phrasing) beside
 * the proposed addition (the rule text). Approve/Reject post
 * `resolve_learning` through the owning route.
 */
export default function SkillDiffCard({
  rule,
  fromEffectId,
  status,
  currentExcerpt,
  onApprove,
  onReject,
}: SkillDiffCardProps) {
  const decided = status !== "pending";
  return (
    <Card data-learning-rule={rule}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">{rule || fromEffectId}</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">{status}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3">
            <h3 className="text-sm font-semibold">current</h3>
            <p className="mt-1 text-sm text-muted-foreground">{currentExcerpt}</p>
          </div>
          <div className="rounded-md border p-3">
            <h3 className="text-sm font-semibold">proposed</h3>
            <p className="mt-1 text-sm">{rule}</p>
          </div>
        </div>
        {!decided ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onApprove}>
              Approve
            </Button>
            <Button type="button" variant="destructive" onClick={onReject}>
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
