import { usageGroups, formatCount } from '../../store/selectors';
import type { UsageEntriesItem } from '../../contracts';
import { Chip } from '../primitives/Chip';

export type UsageDimension = 'topic' | 'transport' | 'status' | 'service';

export interface UsageBreakdownProps {
  entries: UsageEntriesItem[];
  /** Which dimensions to break down by, in the order they should read. */
  dimensions: { key: UsageDimension; label: string }[];
}

/**
 * Observed counts broken down by whatever dimensions the feed can supply.
 *
 * Extracted so the two grains share one renderer. The service page has had a Transport row since
 * the usage feed shipped; the topic page never did, even though `usage.entries[].transport` carries
 * it and the mesh's own promise is to say "how often topics are exercised **and over which
 * transports**". Half a capability, delivered on one of the two surfaces where it means something,
 * because the breakdown lived inside a service-shaped component rather than beside the data.
 *
 * The count goes IN the chip rather than into a tooltip: `sqs 1.2k` is readable, and `sqs` with the
 * number on hover is not readable at all in a screenshot (R6).
 */
export function UsageBreakdown({ entries, dimensions }: UsageBreakdownProps) {
  return (
    <>
      {dimensions.map(({ key, label }) => {
        const groups = usageGroups(entries, key);
        if (groups.length === 0) return null;
        return (
          <div className="bz-usage-chip-row" key={key}>
            <span className="bz-usage-dim">{label}</span>
            {groups.map((g) => (
              <Chip key={g.key}>{g.key} {formatCount(g.count)}</Chip>
            ))}
          </div>
        );
      })}
    </>
  );
}
