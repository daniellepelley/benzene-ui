import { ValueRow } from '../controls/ValueRow';
import { VerdictBadge } from './ContractChanges';

export interface ServiceDriftSummary {
  /** Topic versions belonging to this service that carry at least one classified change. */
  topics: number;
  changes: number;
  breaking: number;
  warning: number;
}

export interface ServiceDriftProps {
  drift: { previous: string; current: string } | null;
  changes: ServiceDriftSummary;
  /**
   * What moved on this service's topics between the previous catalogue and this one — the axis the
   * `drift` badge has always been about, and the one the row could not previously describe.
   */
  since?: ServiceDriftSummary;
  onViewChanges: () => void;
}

/**
 * Whether this service's published contract moved, and what moved in it.
 *
 * This row used to read `spec hash changed: 5feaedb410bf… → b9b30797f974…` and nothing else — two
 * truncated checksums and an arrow. That is a *detection* rendered as a *finding*: it says the tool
 * noticed something and declines to say what, which generates a message thread rather than a
 * decision. Hashes are for machines deciding whether to recompute, not for people deciding whether
 * to escalate.
 *
 * So the count of actual field-level changes leads, the hashes survive as an audit token underneath,
 * and the row goes somewhere. Note the two signals are computed independently — the hash compares
 * this run's spec against the last run's, while the changes compare versions within this run — so
 * they can legitimately disagree, and the copy says which is which rather than implying one number.
 */
export function ServiceDrift({ drift, changes, since, onViewChanges }: ServiceDriftProps) {
  const hasChanges = changes.changes > 0;
  const hasSince = (since?.changes ?? 0) > 0;
  if (!drift && !hasChanges && !hasSince) return null;

  return (
    <ValueRow label="Changes" title="Whether this service's published contract has moved, and what moved in it">
      {/* THE DRIFT LINE, first, because it is what the badge above points at. The hash pair says a
          contract moved; this says which fields, on which topics, and whether any of it breaks a
          consumer — the difference between a detection and a finding. "Reaches" is deliberate: the
          catalogue records who is on each end of a topic, never whose declaration moved. */}
      {hasSince && since && (
        <span className="bz-svc-drift">
          {since.breaking > 0 && <VerdictBadge verdict="breaking" attribute={false} />}
          {since.breaking === 0 && since.warning > 0 && <VerdictBadge verdict="warning" attribute={false} />}
          <span>
            Since the last run: {since.changes} field{since.changes === 1 ? '' : 's'} moved across{' '}
            {since.topics} topic{since.topics === 1 ? '' : 's'} this service is on
            {since.breaking > 0 && `, ${since.breaking} breaking`}
          </span>
          <button type="button" className="bz-link" onClick={onViewChanges}>
            view changes
          </button>
        </span>
      )}
      {hasChanges ? (
        <span className="bz-svc-drift">
          {changes.breaking > 0 && <VerdictBadge verdict="breaking" attribute={false} />}
          {changes.breaking === 0 && changes.warning > 0 && (
            <VerdictBadge verdict="warning" attribute={false} />
          )}
          <span>
            {changes.changes} change{changes.changes === 1 ? '' : 's'} across {changes.topics} topic
            {changes.topics === 1 ? '' : 's'}
            {changes.breaking > 0 && `, ${changes.breaking} breaking`}
          </span>
          <button type="button" className="bz-link" onClick={onViewChanges}>
            view changes
          </button>
        </span>
      ) : !hasSince && (
        // Only when the run-over-run line above said nothing. With both on screen this reads as a
        // contradiction — one line naming the fields that moved, the next saying none did — because
        // the two sentences are about different axes and neither says which it means.
        <span className="bz-svc-drift">
          The published spec changed since the last snapshot, but no payload schema changed between
          this topic&rsquo;s versions.
        </span>
      )}
      {drift && (
        <span className="bz-svc-drift-hash" title="Spec hashes, for audit — not a description of the change">
          spec hash {drift.previous} → {drift.current}
        </span>
      )}
    </ValueRow>
  );
}
