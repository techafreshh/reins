export interface JobDigestData {
  message: string;
  approved: number;
  rejected: number;
  proposed: number;
  pending: number;
  executed: number;
  openThreads: number;
  skippedSensitive: number;
  skippedStale: number;
  state?: string;
}

/**
 * Pure SSR-safe presentational digest section. No hooks, no fetches — the
 * loader supplies the counts, so a plain `GET` of the job page already
 * carries the `Job digest` heading and the approved digit.
 */
export default function JobDigest({ digest }: { digest: JobDigestData | null }) {
  if (!digest) {
    return null;
  }
  return (
    <section aria-label="Job digest">
      <h2 className="text-lg font-semibold">Job digest</h2>
      <p className="mt-1 text-sm text-muted-foreground">{digest.message}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Approved</dt>
          <dd>Approved: {digest.approved}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rejected</dt>
          <dd>Rejected: {digest.rejected}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Proposed</dt>
          <dd>Proposed: {digest.proposed}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sent</dt>
          <dd>Sent: {digest.executed}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Open threads</dt>
          <dd>Open threads: {digest.openThreads}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skipped</dt>
          <dd>
            Skipped: {digest.skippedSensitive} sensitive, {digest.skippedStale} stale
          </dd>
        </div>
      </dl>
    </section>
  );
}
