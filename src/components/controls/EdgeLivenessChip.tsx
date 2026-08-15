import { edgeLivenessOf, type EdgeActivity } from '../../contracts/mesh';
import { Chip } from '../primitives/Chip';

export interface EdgeLivenessChipProps {
  /**
   * The declared edge's per-service activity entry (mesh.md §4.2's `consumerActivity`/
   * `providerActivity`). Undefined means the aggregator hasn't projected this signal at all, in
   * which case this renders nothing — silence must never be read as "confirmed", only as "not yet
   * known". Present-but-empty (`{}`) is the honest "declared, never traced" case.
   */
  activity: EdgeActivity | undefined;
}

/**
 * mesh.md §4.2's "declared, unobserved" state, as a small qualifier beside a consumer or producer
 * name — a decommission *candidate*, never a fact (trace export is lossy by design).
 *
 * Deliberately silent for the 'observed' and 'unknown' cases: a confirmed (declared *and* observed)
 * edge is the unremarkable default and needs no decoration, and an aggregator that hasn't wired the
 * signal must render exactly like today's estate, not invent a "confirmed" claim nobody measured.
 */
export function EdgeLivenessChip({ activity }: EdgeLivenessChipProps) {
  if (edgeLivenessOf(activity) !== 'unobserved') return null;
  return (
    <Chip
      tone="warn"
      title="Declared, but no trace has exercised this edge within the collector's retention window — a decommission candidate, not a fact (mesh.md §4.2)"
    >
      unobserved
    </Chip>
  );
}
