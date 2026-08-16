import type { ServiceUsageSummary } from '../../store/selectors';
import { usageGroups, formatCount, isKnownStatus, isSuccessStatus } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';

export interface ServiceUsageProps {
  usage: ServiceUsageSummary;
  showUtility: boolean;
  onToggleUtility?: () => void;
}

const DIMENSIONS = [
  { key: 'topic', label: 'Topic' },
  { key: 'transport', label: 'Transport' },
  { key: 'status', label: 'Status' },
] as const;

/**
 * Observed traffic for one service, broken down by whatever dimensions the feed could supply.
 *
 * Three states this deliberately keeps apart, because collapsing any two of them is how a dashboard
 * invents work: **no feed** (nothing can be said), **feed wired, nothing seen** (a real observation),
 * and **feed wired, everything seen was benzene plumbing** (also a real observation, and one that
 * would read as "no traffic" if the utility rows were simply dropped).
 */
export function ServiceUsage({ usage, showUtility, onToggleUtility }: ServiceUsageProps) {
  if (usage.mode === 'none') {
    return <EmptyState message="No usage feed is wired, so traffic for this service is unknown." tone="unknown" />;
  }

  const total = usage.entries.reduce((sum, e) => sum + e.count, 0);
  // Three buckets, not two. A status this build does not recognise is not evidence of failure, and
  // counting it as one produced "9.8k messages observed · 9.8k failed" directly above a breakdown
  // reading `success 9.8k` on a perfectly healthy service. The topic surface was fixed for this and
  // this one was not — which is why the rule now lives in `isKnownStatus` rather than at a render
  // site, and why the disclosure below is mandatory wherever the bucket is non-empty.
  const failed = usage.entries
    .filter((e) => !isSuccessStatus(e.status))
    .reduce((sum, e) => sum + e.count, 0);
  const unrecognised = usage.entries
    .filter((e) => !isKnownStatus(e.status))
    .reduce((sum, e) => sum + e.count, 0);

  const hiddenNote = usage.hidden.entries > 0 && (
    <p className="bz-usage-note">
      {formatCount(usage.hidden.messages)} messages on {usage.hidden.entries} benzene utility{' '}
      {usage.hidden.entries === 1 ? 'topic' : 'topics'}{' '}
      {usage.allUtility ? 'are all this feed saw for this service' : 'excluded from the counts above'}.{' '}
      {onToggleUtility && (
        <button type="button" className="bz-usage-toggle" onClick={onToggleUtility}>
          {showUtility ? 'hide' : 'show'} utility traffic
        </button>
      )}
    </p>
  );

  return (
    <div className="bz-svc-usage">
      {usage.mode === 'fleet-wide' && (
        <p className="bz-usage-note" data-provenance="fleet-wide">
          This usage feed does not attribute counts per service — these are fleet-wide counts for the
          topics this service handles, not its own.
        </p>
      )}

      {usage.entries.length === 0 ? (
        <>
          {!usage.allUtility && (
            <EmptyState message="The usage feed is wired and reported nothing for this service." />
          )}
          {hiddenNote}
        </>
      ) : (
        <>
          <p className="bz-usage-legend">
            <strong>{formatCount(total)}</strong> messages observed
            {failed > 0 && <> · {formatCount(failed)} failed</>}
          </p>
          {/* The spec lets a receiver with no `isSuccessful` signal treat an application-defined
              status as a failure, and the usage feed carries no such signal — but permission to
              assume the worst is not permission to render the assumption as a measurement. */}
          {unrecognised > 0 && (
            <p className="bz-usage-note">
              {unrecognised.toLocaleString()} of these are in statuses this build does not recognise.
              They are counted as failures because there is no signal to trust them with — they may
              not be failures.
            </p>
          )}

          {DIMENSIONS.map(({ key, label }) => {
            const groups = usageGroups(usage.entries, key);
            if (groups.length === 0) return null;
            return (
              <div className="bz-usage-chip-row" key={key}>
                <span className="bz-usage-dim">{label}</span>
                {groups.map((g) => (
                  <Chip key={g.key} title={`${g.count.toLocaleString()} messages`}>
                    {g.key} {formatCount(g.count)}
                  </Chip>
                ))}
              </div>
            );
          })}

          {hiddenNote}
        </>
      )}
    </div>
  );
}
