import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import getPolicy from "../../actions/get-policy.js";

/**
 * Trust level and capability vocabularies. Mirrors `server/lib/policy.ts`
 * without importing it: that module pulls node-only DB imports that must
 * stay out of the client bundle.
 */
const POLICY_LEVELS = ["ASK", "SMART", "AUTO"] as const;
const TRUST_CAPABILITIES = ["send_followup", "draft_reply", "label_or_tag"] as const;

export function meta() {
  return [{ title: "Trust & policy" }];
}

export interface TrustLoaderData {
  killSwitch: boolean;
  levels: {
    send_followup: string;
    draft_reply: string;
    label_or_tag: string;
  };
}

function fallbackData(): TrustLoaderData {
  return {
    killSwitch: false,
    levels: { send_followup: "ASK", draft_reply: "ASK", label_or_tag: "ASK" },
  };
}

function normalizeLevels(value: unknown): TrustLoaderData["levels"] {
  const base = fallbackData().levels;
  if (!value || typeof value !== "object") {
    return base;
  }
  const row = value as Record<string, unknown>;
  const pick = (key: keyof typeof base): string =>
    typeof row[key] === "string" && row[key] !== "" ? (row[key] as string) : base[key];
  return {
    send_followup: pick("send_followup"),
    draft_reply: pick("draft_reply"),
    label_or_tag: pick("label_or_tag"),
  };
}

/**
 * SSR-first policy read through the get-policy action itself (the same read
 * the HTTP surface serves): loaders in this framework build never see
 * request cookies, so a same-origin HTTP self-fetch always 401'd in
 * production and bounced signed-in viewers to the placeholder. Auth stays
 * enforced upstream — the framework workspace guard redirects signed-out
 * document loads to sign-in before this loader runs. Any other failure
 * degrades to ASK-everything with the kill switch off.
 */
export async function loader(): Promise<TrustLoaderData> {
  try {
    const policy = await getPolicy.run({});
    return {
      killSwitch: policy.killSwitch === true,
      levels: normalizeLevels(policy.levels),
    };
  } catch {
    return fallbackData();
  }
}

export interface TrustPanelProps {
  levels: Record<string, string>;
  killSwitch: boolean;
  busy?: boolean;
  onUpdate?: (body: Record<string, unknown>) => void;
}

/**
 * Presentational trust panel. Section headings keep the literal
 * `kill switch` / `send_followup` strings probe-visible independent of
 * loader data; the stepper posts `update-policy` writes through `onUpdate`.
 */
export function TrustPanel({ levels, killSwitch, busy = false, onUpdate }: TrustPanelProps) {
  const update = onUpdate ?? (() => {});
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Trust &amp; policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-capability trust that actually gates behavior, plus the global kill switch.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Kill switch</h2>
              <p className="text-sm text-muted-foreground">
                {killSwitch ? "On — executions and proposals are paused." : "Off — running normally."}
              </p>
            </div>
            <Button
              type="button"
              variant={killSwitch ? "destructive" : "default"}
              disabled={busy}
              onClick={() => update({ killSwitch: !killSwitch })}
            >
              {killSwitch ? "Turn off" : "Turn on"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Capabilities" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Capabilities</h2>
        {TRUST_CAPABILITIES.map((capability) => {
          const current = levels[capability] ?? "ASK";
          return (
            <Card key={capability}>
              <CardContent className="flex flex-col gap-3 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-sm font-semibold">{capability}</h3>
                  <p className="text-sm text-muted-foreground">Current: {current}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${capability} level`}>
                  {POLICY_LEVELS.map((level) => (
                    <Button
                      key={level}
                      type="button"
                      size="sm"
                      variant={current === level ? "default" : "outline"}
                      disabled={busy || current === level}
                      onClick={() => update({ capability, level })}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  ASK parks every draft for review. SMART enforces the server-side predicate.
                  AUTO proposes without predicate checks.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

export default function TrustRoute() {
  const { levels, killSwitch } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postUpdate(body: Record<string, unknown>) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/_agent-native/actions/update-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Policy update failed with ${response.status}`);
      }
      void revalidator.revalidate();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Couldn't update policy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mx-auto w-full max-w-3xl px-6 pt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <TrustPanel
        levels={levels}
        killSwitch={killSwitch}
        busy={busy}
        onUpdate={(body) => void postUpdate(body)}
      />
    </div>
  );
}
