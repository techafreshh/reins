import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { Card, CardContent } from "@/components/ui/card";

export function meta() {
  return [{ title: "Audit" }];
}

export interface AuditLoaderRow {
  id: string;
  jobId: string;
  kind: string;
  payload: string;
  createdAt: string;
}

interface AuditLoaderData {
  events: AuditLoaderRow[];
}

function isAuditRow(value: unknown): value is AuditLoaderRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.kind === "string" &&
    typeof row.createdAt === "string"
  );
}

function toIsoStamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function payloadExcerpt(payload: unknown): string {
  if (typeof payload !== "string") {
    return "";
  }
  return payload.length > 160 ? `${payload.slice(0, 160)}…` : payload;
}

/**
 * SSR-first audit read: the loader fetches the global audit log over
 * same-origin HTTP (forwarding the viewer's credentials) so the first
 * paint already carries every event row in ascending order. Auth failures
 * send the viewer back to sign-in; any other fetch failure degrades to an
 * empty log. The log is append-only: no edit or delete controls render.
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<AuditLoaderData> {
  const empty: AuditLoaderData = { events: [] };
  try {
    const url = new URL("/_agent-native/actions/list_audit", request.url);
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
    const events = rows.filter(isAuditRow).map((row) => ({
      ...row,
      createdAt: toIsoStamp(row.createdAt),
    }));
    return { events };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return empty;
  }
}

export default function AuditRoute() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of events, decisions, and policy changes, oldest first.
        </p>
      </header>

      <section aria-label="Audit trail" className="flex flex-col gap-4">
        {events.length === 0 ? (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">No audit events yet.</p>
            </CardContent>
          </Card>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 pr-4 font-medium">Job</th>
                <th className="py-2 pr-4 font-medium">Detail</th>
                <th className="py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t">
                  <td className="py-2 pr-4 font-mono text-xs">{event.kind}</td>
                  <td className="py-2 pr-4 text-xs">{event.jobId || "—"}</td>
                  <td className="max-w-64 truncate py-2 pr-4 text-xs text-muted-foreground">
                    {payloadExcerpt(event.payload)}
                  </td>
                  <td className="py-2 text-xs">
                    <time dateTime={event.createdAt}>{event.createdAt}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
