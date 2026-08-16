import type { Obligation, Rollout } from '../../store/rollouts';
import { VerdictBadge } from './ContractChanges';
import {
  OUTSTANDING_EMPTY, OUTSTANDING_NOT_PUBLISHED, OUTSTANDING_SINGLE_VERSION, POLLED_INSTANCE_CAVEAT,
} from './compatibilityCopy';

/** Oxford-free list join, matching the constraint sentences. */
const list = (services: string[]): string =>
  (services.length <= 1
    ? services[0] ?? ''
    : `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`);

export interface ServiceOutstandingProps {
  service: string;
  obligations: Obligation[];
  /**
   * Rollouts where this service has already moved and somebody else has not.
   *
   * Without this the page could only say "nothing outstanding", which on a service that moved first
   * and correctly reads as a clean bill of health — including when the version it moved TO is
   * produced by nobody and its own issue card shows thousands of errors.
   */
  awaiting?: Rollout[];
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
  service, obligations, awaiting = [], published, hasVersionPairs, onOpenTopic,
}: ServiceOutstandingProps) {
  const waitingOn = awaiting.length > 0 && (
    <section className="bz-outstanding bz-waiting">
      <h4>
        Waiting on
        <span className="bz-outstanding-count">
          {awaiting.length} topic{awaiting.length === 1 ? '' : 's'} where {service} has moved and the
          other side has not
        </span>
      </h4>
      <ul className="bz-outstanding-list">
        {awaiting.map((r) => (
          <li key={`${r.topic}@${r.version}`} className="bz-outstanding-row" data-kind="waiting"
            data-breached={r.breached ? 'true' : undefined}>
            <button type="button" className="bz-topic-name" onClick={() => onOpenTopic(r.topic, r.version)}>
              {r.topic}
              <span className="bz-topic-version">{r.baselineVersion} → {r.version}</span>
            </button>
            <strong className="bz-outstanding-verb">{r.outstanding.join(', ')}</strong>
            <span className="bz-outstanding-other">
              {r.breached ? 'the gap is live now' : 'has not moved yet'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );

  if (obligations.length === 0) {
    // Three different sentences, because they lead to three different actions. "Nothing outstanding",
    // "this tool never looked" and "there is nothing here to roll out" collapse into one blank line
    // only if you do not mind a reader concluding the first when the truth is the second.
    const message = !published ? OUTSTANDING_NOT_PUBLISHED
      : !hasVersionPairs ? OUTSTANDING_SINGLE_VERSION
        : OUTSTANDING_EMPTY(service);
    return (
      <>
        <p className="bz-page-note bz-outstanding-empty">{message}</p>
        {waitingOn}
      </>
    );
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
            {/* Named, not "the other side". A service owner's first click has to answer "who is
                blocked on me" without a hop to another screen, and the anonymous phrasing put the
                one sentence they would paste into Slack on a page they had not opened. */}
            <span className="bz-outstanding-other">
              {o.counterparts.length === 0
                ? (o.kind === 'catchUp' ? 'the other side has already moved' : 'the other side is already reading it')
                : o.kind === 'catchUp'
                  ? `${list(o.counterparts)} has already moved, and cannot retire ${o.baselineVersion} until this ships`
                  : `${list(o.counterparts)} is already reading ${o.version}`}
            </span>
            {/* `handle v2` reads as `swap to v2`. On a topic whose other side is still on the
                baseline, a version-only deploy kills the live path — which the catalogue knows and
                the row used to leave the reader to infer from two version lists. */}
            {o.alongsideBaseline && (
              <span className="bz-outstanding-alongside">
                keep {o.baselineVersion} live — {list(o.counterparts)} still uses it
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The most instance-sensitive assertion in the product — it names one service and one action
          — and it was the surface without the caveat. It sat on the two screens a reader drills
          into and was missing from the two they scan. */}
      <p className="bz-muted bz-outstanding-caveat">{POLLED_INSTANCE_CAVEAT}</p>
      {waitingOn}
    </section>
  );
}
