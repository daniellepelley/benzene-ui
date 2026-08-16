import type { Rollout } from '../../store/rollouts';
import { VerdictBadge } from './ContractChanges';
import { ROLLOUT_BREACHED_LABEL, ROLLOUT_STATE_LABEL, VERSIONED_OUT_COPY } from './compatibilityCopy';

export interface RolloutListProps {
  rollouts: Rollout[];
  onOpenTopic: (topic: string, version: string) => void;
  onOpenService: (service: string) => void;
}

/**
 * One row per topic version-pair: what state its rollout is in, who has moved, who owes a move, and
 * the ordering constraint between the two ends.
 *
 * The grain is the point. The field-level ledger answers "what changed"; this answers "what has to
 * be deployed", and they are different objects over the same evidence — `shipping:book` is one
 * deploy decision and three field changes, and counting it three times is how the estate's
 * best-engineered topic became the reddest thing on screen.
 *
 * What is deliberately absent: a sequence. Every constraint here is between the two ends of ONE
 * topic. Unioning them into "these five services must ship together" is technically derivable and
 * collapses to the whole estate the moment one service is a hub, at which point it has stopped being
 * advice.
 */
export function RolloutList({ rollouts, onOpenTopic, onOpenService }: RolloutListProps) {
  return (
    <ul className="bz-rollouts">
      {rollouts.map((r) => (
        <li
          key={`${r.topic}@${r.version}`}
          className="bz-rollout"
          data-state={r.state}
          data-verdict={r.verdict}
          data-disjoint={r.disjoint ? 'true' : undefined}
        >
          <div className="bz-rollout-head">
            <span className="bz-vc-chip" data-state={r.state} data-breached={r.breached ? 'true' : undefined}>
              {r.breached ? ROLLOUT_BREACHED_LABEL : (ROLLOUT_STATE_LABEL[r.state] ?? r.state)}
            </span>
            <button type="button" className="bz-topic-name" onClick={() => onOpenTopic(r.topic, r.version)}>
              {r.topic}
              <span className="bz-topic-version">{r.baselineVersion} → {r.version}</span>
            </button>
            <VerdictBadge verdict={r.verdict} attribute={false} baseline={r.baselineVersion} />
          </div>

          {/* The constraint is the row's substance and it is a sentence, so it reads rather than
              scans. Absent where there is nothing to order, rather than replaced by a reassurance. */}
          {r.constraint && <p className="bz-rollout-constraint">{r.constraint}</p>}
          {r.disjointNote && <p className="bz-rollout-constraint bz-rollout-disjoint">{r.disjointNote}</p>}
          {r.state === 'complete' && r.overlapRetained && r.verdict === 'breaking' && (
            <p className="bz-rollout-constraint bz-rollout-managed">{VERSIONED_OUT_COPY}</p>
          )}
          {r.state === 'unattributable' && (
            <p className="bz-rollout-constraint">
              No service in this estate is on the {r.unattributableSide === 'producers' ? 'sending' : 'handling'}{' '}
              side of {r.topic} at any version, so nobody here can be named as owing this move. That
              side may be outside the estate — a website, an app, or a partner.
            </p>
          )}
          {r.mixedDirections && (
            <p className="bz-rollout-constraint">
              This pair changes both an event and a request, so the two sides own different halves of
              it and no single ordering holds. The services below are those still on the older
              version.
            </p>
          )}

          <div className="bz-rollout-parties">
            {r.outstanding.length > 0 && (
              <span className="bz-change-party" data-party="outstanding">
                <span className="bz-change-party-label">owes</span>
                {r.outstanding.map((name) => (
                  <button key={name} type="button" className="bz-cat-svc" data-outstanding="true"
                    onClick={() => onOpenService(name)}>
                    {name}
                  </button>
                ))}
              </span>
            )}
            {r.moved.length > 0 && (
              <span className="bz-change-party" data-party="moved">
                <span className="bz-change-party-label">moved</span>
                {r.moved.map((name) => (
                  <button key={name} type="button" className="bz-cat-svc" onClick={() => onOpenService(name)}>
                    {name}
                  </button>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
