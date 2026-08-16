import type { TopicsVersionCompatibilityItem } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { NO_PRODUCER_COPY } from './compatibilityCopy';

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
 *
 * That guard covered an ABSENT entry and not an EVIDENCE-FREE one, which is a different hole and the
 * more dangerous of the two. `isCompatible` is `producedNotConsumed.length === 0`, so a topic that
 * nothing in the estate produces reconciles vacuously to `true` — an empty set has nothing left over
 * — and the panel printed "every version produced has a matching consumer" directly above the word
 * `none`. That is the shape of every HTTP-fronted topic, whose callers are a website or an app the
 * collector cannot see, and in a real estate it fired on the two topics carrying the worst changes.
 * The boolean is correctly named for what it computes; the defect was the sentence wrapped around it,
 * so the third arm below is the fix and no wire change was needed.
 */
export function VersionCompatibility({ compatibility }: VersionCompatibilityProps) {
  if (!compatibility) return null;

  const { isCompatible, producedVersions, consumedVersions, producedNotConsumed, consumedNotProduced } =
    compatibility;
  const noProducer = producedVersions.length === 0;

  return (
    <section className="bz-vc" data-skew={isCompatible && !noProducer ? undefined : 'true'}>
      <h3>Version compatibility</h3>
      <p className="bz-vc-lead">
        {noProducer
          ? NO_PRODUCER_COPY
          : isCompatible
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
