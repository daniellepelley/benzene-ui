import type { Obligation } from '../../store/rollouts';
import { VerdictBadge } from './ContractChanges';
import { OUTSTANDING_EMPTY, OUTSTANDING_NOT_PUBLISHED, OUTSTANDING_SINGLE_VERSION } from './compatibilityCopy';

export interface ServiceOutstandingProps {
  service: string;
  obligations: Obligation[];
  /** Whether this estate's aggregator publishes contract comparisons at all. */
  published: boolean;
  /** Whether any topic this service touches has more than one version. */
  hasVersionPairs: boolean;
  onOpenTopic: (topic: string, version: string) => void;
}

/**
 * What this release requires of this service.
 *
 * The service page answered "what do I declare?" and never "what do I owe?". A service owner's first
 * click therefore told the owner of the estate's single blocking service, in a release it was the
 * critical path of, that it had nothing to do: its card read `CONSUMES order:placed v1 / PRODUCES
 * invoice:raise v1` and stopped, with no badge and no amber, because every contract mark in the
 * product attached to whoever had already declared the new version.
 *
 * One row per obligation, never rolled into a count. `billing-api` has two, on two topics, in two
 * different roles — and the one that gets missed is always the second one on a service somebody has
 * already ticked off.
 *
 * The verb is the point of the row. "handle v2" and "produce v2" are different pieces of work by
 * different people, and which of them applies is not readable off the topic: a handler owns the shape
 * of what it accepts, so on a request topic it is the CALLER that has to move. That is computed in
 * `rollouts.ts` and rendered here.
 */
export function ServiceOutstanding({
  service, obligations, published, hasVersionPairs, onOpenTopic,
}: ServiceOutstandingProps) {
  if (obligations.length === 0) {
    // Three different sentences, because they lead to three different actions. "Nothing outstanding",
    // "this tool never looked" and "there is nothing here to roll out" collapse into one blank line
    // only if you do not mind a reader concluding the first when the truth is the second.
    const message = !published ? OUTSTANDING_NOT_PUBLISHED
      : !hasVersionPairs ? OUTSTANDING_SINGLE_VERSION
        : OUTSTANDING_EMPTY(service);
    return <p className="bz-page-note bz-outstanding-empty">{message}</p>;
  }

  return (
    <section className="bz-outstanding">
      <h4>
        Outstanding
        <span className="bz-outstanding-count">
          {obligations.length} contract move{obligations.length === 1 ? '' : 's'}
        </span>
      </h4>
      <ul className="bz-outstanding-list">
        {obligations.map((o) => (
          <li key={`${o.topic}@${o.version}`} className="bz-outstanding-row" data-kind={o.kind}>
            <button
              type="button"
              className="bz-topic-name"
              onClick={() => onOpenTopic(o.topic, o.version)}
            >
              {o.topic}
              <span className="bz-topic-version">{o.baselineVersion} → {o.version}</span>
            </button>
            <strong className="bz-outstanding-verb">{o.verb}</strong>
            {/* Attributed, per the standing rule: a verdict is always about a named reader, never a
                bare word. An additive field on an event is genuinely compatible FOR A v1 READER and
                still leaves this service a deploy to do — which is exactly why the obligation is not
                derived from the verdict. */}
            <VerdictBadge verdict={o.verdict} attribute={false} baseline={o.baselineVersion} />
            <span className="bz-outstanding-other">
              {o.kind === 'catchUp'
                ? 'the other side has already moved'
                : 'the other side is already reading it'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
