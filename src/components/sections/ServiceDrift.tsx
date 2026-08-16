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
export function ServiceDrift({ drift, changes, onViewChanges }: ServiceDriftProps) {
  const hasChanges = changes.changes > 0;
  if (!drift && !hasChanges) return null;

  return (
    <ValueRow label="Changes" title="Whether this service's published contract has moved, and what moved in it">
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
      ) : (
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
