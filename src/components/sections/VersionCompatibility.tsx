import type { TopicsVersionCompatibilityItem } from '../../contracts';
import { Chip } from '../primitives/Chip';

export interface VersionCompatibilityProps {
  compatibility: TopicsVersionCompatibilityItem | null;
}

const Versions = ({ versions }: { versions: string[] }) =>
  versions.length === 0 ? (
    <span className="bz-vc-none">none</span>
  ) : (
    <>
      {versions.map((v) => (
        <Chip key={v || '(unversioned)'}>{v || 'unversioned'}</Chip>
      ))}
    </>
  );

/**
 * Which payload versions the fleet produces, reconciled against which it consumes.
 *
 * A version produced that no service handles at that version is the load-bearing signal — a
 * forward-compatibility risk. It comes with one honest caveat the mesh cannot see past: an upcaster
 * registered on the consumer may transparently bridge it. So this is a prompt to confirm, never a
 * proven break, and the copy says exactly that rather than raising a false alarm.
 *
 * Renders nothing when the aggregator emitted no entry — it does so only for a topic with more than
 * one version in play, and painting "compatible" over a check nobody ran would be worse than silence.
 */
export function VersionCompatibility({ compatibility }: VersionCompatibilityProps) {
  if (!compatibility) return null;

  const { isCompatible, producedVersions, consumedVersions, producedNotConsumed, consumedNotProduced } =
    compatibility;

  return (
    <section className="bz-vc" data-skew={isCompatible ? undefined : 'true'}>
      <h3>Version compatibility</h3>
      <p className="bz-vc-lead">
        {isCompatible
          ? 'Every version produced in the fleet has a matching consumer.'
          : 'A version is produced that no service handles at that version — a forward-compatibility risk. ' +
            "Confirm an upcaster on the consumer bridges it (upcasters aren't visible to the mesh)."}
      </p>

      <div className="bz-vc-grid">
        <div className="bz-vc-cell">
          <span className="bz-vc-label">Produced</span>
          <Versions versions={producedVersions} />
        </div>
        <div className="bz-vc-cell">
          <span className="bz-vc-label">Consumed</span>
          <Versions versions={consumedVersions} />
        </div>
      </div>

      {producedNotConsumed.length > 0 && (
        <p className="bz-vc-issue" data-severity="bad">
          <span className="bz-vc-label">Produced, not consumed:</span>
          <Versions versions={producedNotConsumed} />
        </p>
      )}
      {consumedNotProduced.length > 0 && (
        <p className="bz-vc-issue">
          <span className="bz-vc-label">Consumed, not produced:</span>
          <Versions versions={consumedNotProduced} />
        </p>
      )}
    </section>
  );
}
