import type { TopicsVersionCompatibilityItem } from '../../contracts';
import type { Rollout } from '../../store/rollouts';
import { Chip } from '../primitives/Chip';
import {
  DISJOINT_CLAIM_NOTE, NO_PRODUCER_COPY, POLLED_INSTANCE_CAVEAT, ROLLOUT_BREACHED_LABEL, ROLLOUT_STATE_LABEL,
  VERSIONED_OUT_COPY,
} from './compatibilityCopy';

export interface VersionCompatibilityProps {
  compatibility: TopicsVersionCompatibilityItem | null;
  /**
   * The rollout for the version pair the reader is looking at, when there is one.
   *
   * The panel used to describe the version skew and stop. The skew is only half the question — a
   * version gap matters exactly when the difference between the two versions matters — and the other
   * half was already computed, two lines away in the aggregator, and rendered on a different page.
   */
  rollout?: Rollout | null;
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
 * Which payload versions the fleet produces, reconciled against which it consumes — and, now, what
 * that gap actually costs.
 *
 * Renders nothing when the aggregator emitted no entry: it does so only for a topic with more than
 * one version in play, and painting "compatible" over a check nobody ran would be worse than silence.
 *
 * That guard covered an ABSENT entry and not an EVIDENCE-FREE one, which is a different hole and the
 * more dangerous of the two. `isCompatible` is `producedNotConsumed.length === 0`, so a topic that
 * nothing in the estate produces reconciles vacuously to `true` — an empty set has nothing left over
 * — and the panel printed "every version produced has a matching consumer" directly above the word
 * `none`. That is the shape of every HTTP-fronted topic, whose callers are a website or an app the
 * collector cannot see. The boolean is correctly named for what it computes; the defect was the
 * sentence wrapped around it.
 *
 * The lead now branches five ways rather than three, because ONE SENTENCE WAS SERVING TWO
 * STRUCTURALLY OPPOSITE SITUATIONS. "Confirm an upcaster on the consumer bridges it" is right when
 * the NEWEST version is the unhandled one. It is actively misleading when an OLDER version is
 * unhandled — the consumer dropped support before the producer migrated, so there is no consumer at
 * that version to hold an upcaster and the move is producer-side. A reader following the old advice
 * goes to the team that has already shipped, and on this product's own fixture that is the topic
 * running at a 100% error rate.
 */
export function VersionCompatibility({ compatibility, rollout }: VersionCompatibilityProps) {
  if (!compatibility) return null;

  const { isCompatible, producedVersions, consumedVersions, producedNotConsumed, consumedNotProduced } =
    compatibility;
  const noProducer = producedVersions.length === 0;
  const skewed = !isCompatible || noProducer;

  return (
    <div className="bz-vc" data-skew={skewed ? 'true' : undefined}>
      <h4>Which versions are covered on both sides</h4>

      {/* The state and the ordering constraint go at the top, where a reader who has arrived at a
          topic is already looking, rather than in a section of their own. */}
      {rollout && (
        <p className="bz-vc-state">
          <span className="bz-vc-chip" data-state={rollout.state} data-verdict={rollout.verdict}
            data-breached={rollout.breached ? 'true' : undefined}>
            {rollout.breached ? ROLLOUT_BREACHED_LABEL : (ROLLOUT_STATE_LABEL[rollout.state] ?? rollout.state)}
          </span>
          {rollout.constraint && <span className="bz-vc-constraint">{rollout.constraint}</span>}
        </p>
      )}

      <p className="bz-vc-lead">{lead(compatibility, rollout ?? null)}</p>

      {/* Only where the version sets are disjoint may the product say categorically that nothing
          handles what is being sent. Everywhere else a producer declaring two versions may be
          publishing every message on both, and the catalogue cannot tell. */}
      {rollout?.disjoint && <p className="bz-vc-lead bz-vc-disjoint">{DISJOINT_CLAIM_NOTE}</p>}

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

      {/* Registration is last-writer-wins and the spec poll reaches whichever instance the load
          balancer chose, so two consecutive runs can legitimately disagree mid-rollout. This is what
          stops "declared" being read as "deployed" — the exact question this panel invites. */}
      <p className="bz-muted bz-vc-caveat">{POLLED_INSTANCE_CAVEAT}</p>
    </div>
  );
}

/**
 * The five arms, ordered so the most specific claim wins.
 *
 * A vacuous reconciliation is described as vacuous before anything else gets to call it compatible,
 * and a versioned-out breaking change is named positively rather than falling through to a bare
 * "every version has a consumer" — the team that ran a proper overlap window is currently shown the
 * reddest row on the page for their trouble.
 */
function lead(compatibility: TopicsVersionCompatibilityItem, rollout: Rollout | null): string {
  const { isCompatible, producedVersions, consumedVersions, producedNotConsumed, consumedNotProduced } =
    compatibility;

  if (producedVersions.length === 0) return NO_PRODUCER_COPY;

  // The newest version IN PLAY, across both sides — not the newest produced. On the case this branch
  // exists for, the consumer has moved to v2 and the producer is still on v1, so the newest produced
  // version IS the unhandled one and testing against it puts the reader straight back on the wrong
  // advice.
  const inPlay = [...new Set([...producedVersions, ...consumedVersions])].sort();
  const newest = inPlay[inPlay.length - 1] as string;
  if (producedNotConsumed.length > 0 && !producedNotConsumed.includes(newest)) {
    return 'A version is still being produced that no service handles — and it is not the newest '
      + 'one, so the handlers have moved past it rather than not yet reached it. There is no '
      + 'consumer at that version to hold an upcaster; the move is producer-side.';
  }

  if (producedNotConsumed.length > 0) {
    return 'A version is produced that no service handles at that version — a forward-compatibility '
      + "risk. Confirm an upcaster on the consumer bridges it (upcasters aren't visible to the mesh).";
  }

  if (consumedNotProduced.length > 0) {
    return 'A version is handled that no service in this estate produces — a rollout waiting on its '
      + 'producer, or a handler left behind after one. Mesh cannot tell which.';
  }

  if (isCompatible && rollout?.overlapRetained && rollout.verdict === 'breaking') {
    return VERSIONED_OUT_COPY;
  }

  return 'Every version produced in the fleet has a matching consumer.';
}
