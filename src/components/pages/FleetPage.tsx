import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectEstateSummary, selectDivergences, selectIssueSummary, selectFleetAvailable,
  selectInboxIssues, selectFilter, selectVisibleServices, selectEstateVerdict,
  selectChangeSummary, selectRollouts, selectFeedErrors, selectNeverHeartbeated, selectFeedHealth,
  selectUndeclaredServices, selectMultiInstanceServices,
} from '../../store/selectors';
import {
  navigated, filterChanged,
} from '../../store/slices/viewSlice';
import { ServiceList } from '../containers/ServiceList';
import { DivergenceBlock, type Divergence } from '../sections/DivergenceBlock';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { EstateStats } from '../controls/EstateStats';
import { IssueRow } from '../controls/IssueRow';
import { RolloutList } from '../sections/RolloutList';
import { estateInstanceCaveat } from '../sections/compatibilityCopy';
import type { Rag } from '../../contracts';

/** How many issues the front door shows before handing off to the full inbox. */
const INBOX_PREVIEW = 5;

/** How many changes the front door shows before handing off to the ledger. */
const CHANGES_PREVIEW = 5;

/**
 * The estate at a glance.
 *
 * Ordered by the question the reader arrives with: *is anything wrong, and where*. So the counts
 * come first and largest, then what needs attention, then the services themselves; the structural
 * material — topology, flagged topics — sits below, because it answers a different question that
 * nobody asks in the first ten seconds.
 */
export function FleetPage() {
  const dispatch = useAppDispatch();
  const summary = useAppSelector(selectEstateSummary);
  const divergences = useAppSelector(selectDivergences);
  const issueSummary = useAppSelector(selectIssueSummary);
  const inbox = useAppSelector(selectInboxIssues);
  const liveAvailable = useAppSelector(selectFleetAvailable);
  const filter = useAppSelector(selectFilter);
  const visible = useAppSelector(selectVisibleServices);
  const changeSummary = useAppSelector(selectChangeSummary);
  // The preview shows ROLLOUTS, not field diffs. A field diff is not an estate-level object; a topic
  // mid-migration with a named blocker is. Ranked by the same rule as the Rollouts screen, so the
  // five here are the same five at the top there.
  const rollouts = useAppSelector(selectRollouts);
  const feedErrors = useAppSelector(selectFeedErrors);
  // Wired but not answering is the case that matters: no collector at all is not a gap in knowledge.
  const liveWired = useAppSelector(selectFeedHealth) != null;
  const neverHeartbeated = useAppSelector(selectNeverHeartbeated);
  const undeclared = useAppSelector(selectUndeclaredServices);
  const multiInstance = useAppSelector(selectMultiInstanceServices);
  const topRollouts = rollouts.slice(0, CHANGES_PREVIEW);
  const outstandingRollouts = rollouts.filter((r) => r.outstanding.length > 0);
  const verdict = useAppSelector(selectEstateVerdict);

  // The three classes of declared-vs-observed disagreement, as data. Two of them require a live
  // plane to mean anything — without a collector every service is "never observed", and reporting
  // that as a divergence would make the block useless the moment it is unwired.
  const divergenceRows: Divergence[] = [
    ...(liveAvailable && neverHeartbeated.length > 0 ? [{
      kind: 'silent',
      rag: 'gone' as const,
      label: 'In the manifest, never heard from',
      diagnosis: 'the reporting middleware may not be wired',
      services: neverHeartbeated,
    }] : []),
    ...(undeclared.length > 0 ? [{
      kind: 'undeclared',
      rag: 'amber' as const,
      label: 'Reporting, but absent from the manifest',
      diagnosis: `the aggregator has not fetched a spec for ${undeclared.length === 1 ? 'it' : 'them'}`,
      services: undeclared,
    }] : []),
    // STALE, not "silent" — a stale service told you it was fine and then stopped talking; a silent
    // one has never spoken. Different problems, different fixes, so they stay separate rows.
    ...(liveAvailable && divergences.length > 0 ? [{
      kind: 'stale',
      rag: 'amber' as const,
      label: 'Declared healthy, then went quiet',
      diagnosis: 'last heartbeat is older than the staleness window',
      services: divergences,
    }] : []),
  ];


  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  /*
   * THE HEALTH TILES ARE FED BY THE MANIFEST, WHICH IS A SNAPSHOT.
   *
   * With the live plane down, `0 DEGRADED / 0 UNREACHABLE` rendered directly beneath a banner saying
   * the plane could not be reached — claims about reachability made by a UI that had just admitted it
   * cannot measure reachability. The tile one place to the right already knows how to say
   * `— NOT COMPUTED` when its input is unreadable; these three did not.
   *
   * A count of services by status is a contract fact worth keeping, so this feeds it properly rather
   * than deleting it: the manifest supplies the count, and where the live plane is wired but not
   * answering, the derived-from-observation tiles say they were not computed instead of asserting a
   * zero. `Services` stays a real number — the manifest is a perfectly good source for how many
   * services exist, and that is a different question from whether they are up.
   */
  const healthUnknown = liveWired && !liveAvailable;
  const healthTile = (key: string, value: number, label: string, rag: Rag) =>
    (healthUnknown
      ? { key, value: 0, label, placeholder: '—', note: 'not computed — the live plane is not answering' }
      : { key, value, label, rag });

  const stats = [
    { key: 'total', value: summary.total, label: 'Services' },
    healthTile('red', summary.counts.red, 'Unhealthy', 'red'),
    healthTile('amber', summary.counts.amber, 'Degraded', 'amber'),
    healthTile('gone', summary.counts.gone, 'Unreachable', 'gone'),
    // One definition, one number. `summary.drift` counts SERVICES whose spec hash moved, while the
    // changed-topic count is a different figure on a different page — which is why a reader could see
    // "1" here and "4" on the Value page and have no way to reconcile them. This tile now counts the
    // thing the reader is actually asking about, and leads to the ledger that explains it.
    changeSummary.published
      ? {
        key: 'changes',
        value: changeSummary.total,
        label: 'Contract changes',
        // Red on the JOIN, not on the verdict. `breaking` alone painted the estate red for a
        // migration that had been versioned out and needed nobody to do anything — a finished piece
        // of work rendered as an emergency at the top of the first screen anybody opens. The tile's
        // VALUE is unchanged; only what makes it red is.
        rag: (outstandingRollouts.some((r) => r.verdict === 'breaking') ? 'red' : 'amber') as Rag,
        // The note carries its OWN denominator, because it counts a different object from the value
        // above it: the value is field changes, the note is topics. "4 awaiting a move" beneath a
        // "9" reads as four of the nine, and clicking through lands on a page headed "6 rollouts" —
        // the first number on the estate page failing to survive its own click. The tile's value is
        // deliberately untouched; one definition and one number was bought at real cost.
        note: outstandingRollouts.length > 0
          ? `${outstandingRollouts.length} of ${rollouts.length} topics awaiting a move`
          : `none of ${rollouts.length} topics awaiting a move`,
        onClick: () => dispatch(navigated({ page: 'changes' })),
      }
      : {
        // Never a 0 here: this aggregator did not look, which is not the same as finding nothing.
        key: 'changes', value: 0, label: 'Contract changes', placeholder: '—', note: 'not computed',
      },
  ];

  return (
    <div className="bz-page">
      {/* NAMED, and in the chrome. An artifact the UI could not read is a fact about the plumbing,
          not about the estate, and until this line existed the only way to discover a 404 on
          topics.json was to open the browser console — the page itself said no service had declared
          a topic. The live plane has said "unreachable — retrying" since round 2; this is the static
          half held to the same standard. */}
      {feedErrors.length > 0 && (
        <p className="bz-feed-health" data-kind="bad">
          {feedErrors.map((e) => (
            <span key={e.feed}>
              <strong>{e.feed}</strong> could not be read ({e.message}) — anything derived from it is
              unknown, not empty.
            </span>
          ))}
        </p>
      )}

      {/* THE VERDICT, at full volume, above the numbers it summarises. The page's owned question is
          "what state is the estate in, and what should I look at first?" and nothing on it answered
          either half — five tiles and five cards, and the reader did the arithmetic. */}
      <p className="bz-estate-verdict" data-rag={verdict.clauses.length > 0 ? verdict.rag : undefined}>
        {verdict.clauses.length === 0
          ? `All ${verdict.services} services are healthy, and nothing is awaiting a contract move.`
          : (
            <>
              <StatusGlyph rag={verdict.rag} label="estate state" />
              {' '}
              {verdict.services} services: {joinClauses(verdict.clauses)}.
            </>
          )}
      </p>

      <EstateStats stats={stats} />

      {/* FOUR BANNERS, ONE BLOCK. Each of these was a separate paragraph of amber prose: never
          heartbeated, undeclared, and gone quiet. Individually honest; stacked, a reader could not
          tell how many different things were wrong or which was theirs. */}
      <DivergenceBlock divergences={divergenceRows} onOpenService={openService} />

      {liveAvailable && inbox.length > 0 && (
        <section>
          <div className="bz-section-head">
            <h2>Needs attention</h2>
            {/* The window is stated because it is deliberately NOT the one the picker controls: an
                overnight failure has to greet the morning check. */}
            <span className="bz-page-note">last 24 hours</span>
            <button
              type="button"
              className="bz-section-more"
              onClick={() => dispatch(navigated({ page: 'issue', selected: 'all' }))}
            >
              see all {issueSummary.distinct} →
            </button>
          </div>
          {inbox.slice(0, INBOX_PREVIEW).map((issue) => (
            <IssueRow
              key={issue.fingerprint}
              issue={issue}
              onOpen={(fingerprint) => dispatch(navigated({ page: 'issue', selected: fingerprint }))}
            />
          ))}
        </section>
      )}

      {/* BELOW "needs attention", deliberately. A change ledger is a change-review surface, and putting
          it above the alert inbox put it in the position a reader's eye reserves for "why was I
          paged" — at 3am that costs seconds that matter. It sits above the service list because it
          is closer in kind to an open issue than to an inventory row. */}
      {changeSummary.published && topRollouts.length > 0 && (
        <section>
          <div className="bz-section-head">
            <h2>Contract changes</h2>
            <span className="bz-page-note">
              which topic versions are covered on both sides, against each topic’s previous version
            </span>
            <button
              type="button"
              className="bz-section-more"
              onClick={() => dispatch(navigated({ page: 'changes' }))}
            >
              see all {rollouts.length} →
            </button>
          </div>
          {/* Not in "needs attention", deliberately: that section is gated on a live collector and
              fed by the issue feed, and a contract obligation is derivable with ZERO telemetry.
              Filing it there would make this wave's headline vanish on every estate without a
              collector, and would quietly turn a review surface into an incident one. */}
          <p className="bz-muted bz-changes-caveat">{estateInstanceCaveat(multiInstance)}</p>
          <RolloutList
            rollouts={topRollouts}
            onOpenTopic={(topic, version) => dispatch(navigated({
              page: 'topic', selected: topic, selectedVersion: version,
            }))}
            onOpenService={openService}
          />
        </section>
      )}

      <section>
        {/* The filter sits with the list it filters. It used to live in the app header, where it was
            on every page but only did anything on this one — a control that visibly does nothing is
            worse than a missing one, because a reader concludes the search found nothing. */}
        <div className="bz-section-head">
          <h2>Services</h2>
          <input
            className="bz-catalog-filter"
            aria-label="Filter services"
            placeholder="Filter services…"
            value={filter}
            onChange={(e) => dispatch(filterChanged(e.target.value))}
          />
          {filter.trim() !== '' && (
            <span className="bz-catalog-count">
              {visible.length} of {summary.total}
            </span>
          )}
        </div>
        {/* The spec view links back here, and self-reported URLs resolve against here. */}
        <ServiceList pageUrl={typeof location === 'undefined' ? '' : location.pathname + location.search} />
      </section>


    </div>
  );
}

/** Oxford-comma-free clause joining: "a, b and c". A verdict is a sentence, not a list. */
function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0]!;
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
}
