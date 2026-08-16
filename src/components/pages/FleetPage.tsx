import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectEstateSummary, selectDivergences, selectIssueSummary, selectFleetAvailable,
  selectFlaggedTopics, selectEdges, selectFlows, selectFailingFlowsOnly, selectInboxIssues,
  selectServiceRags, selectCollapsedSections, selectFilter, selectVisibleServices,
  selectChangeSummary, selectAllChanges,
} from '../../store/selectors';
import { navigated, failingFlowsToggled, sectionToggled, filterChanged } from '../../store/slices/viewSlice';
import { ServiceList } from '../containers/ServiceList';
import { TopicCatalog } from '../containers/TopicCatalog';
import { CollapsibleSection } from '../controls/CollapsibleSection';
import { TopologyGraph } from '../sections/TopologyGraph';
import { FlowList } from '../controls/FlowList';
import { EstateStats } from '../controls/EstateStats';
import { IssueRow } from '../controls/IssueRow';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { VerdictBadge, shortPath } from '../sections/ContractChanges';
import { Chip } from '../primitives/Chip';
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
  const flagged = useAppSelector(selectFlaggedTopics);
  const edges = useAppSelector(selectEdges);
  const rags = useAppSelector(selectServiceRags);
  const flows = useAppSelector(selectFlows);
  const failingOnly = useAppSelector(selectFailingFlowsOnly);
  const collapsed = useAppSelector(selectCollapsedSections);
  const filter = useAppSelector(selectFilter);
  const visible = useAppSelector(selectVisibleServices);
  const changeSummary = useAppSelector(selectChangeSummary);
  const allChanges = useAppSelector(selectAllChanges);
  const topChanges = allChanges.slice(0, CHANGES_PREVIEW);

  // A default-collapsed section inverts the flag rather than seeding the store, so a reader who
  // opens one keeps it open without the store carrying a special case for it.
  const isOpen = (id: string, collapsedByDefault = false) =>
    collapsedByDefault ? collapsed.includes(id) : !collapsed.includes(id);
  const toggle = (id: string) => dispatch(sectionToggled(id));

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  const stats = [
    { key: 'total', value: summary.total, label: 'Services' },
    { key: 'red', value: summary.counts.red, label: 'Unhealthy', rag: 'red' as const },
    { key: 'amber', value: summary.counts.amber, label: 'Degraded', rag: 'amber' as const },
    { key: 'gone', value: summary.counts.gone, label: 'Unreachable', rag: 'gone' as const },
    // One definition, one number. `summary.drift` counts SERVICES whose spec hash moved, while the
    // changed-topic count is a different figure on a different page — which is why a reader could see
    // "1" here and "4" on the Value page and have no way to reconcile them. This tile now counts the
    // thing the reader is actually asking about, and leads to the ledger that explains it.
    changeSummary.published
      ? {
        key: 'changes',
        value: changeSummary.total,
        label: 'Contract changes',
        rag: ((changeSummary.counts.breaking ?? 0) > 0 ? 'red' : 'amber') as Rag,
        onClick: () => dispatch(navigated({ page: 'changes' })),
      }
      : {
        // Never a 0 here: this aggregator did not look, which is not the same as finding nothing.
        key: 'changes', value: 0, label: 'Contract changes', placeholder: '—', note: 'not computed',
      },
  ];

  return (
    <div className="bz-page">
      <EstateStats stats={stats} />

      {/* Only meaningful with a collector — without one, every service is "never observed", and
          reporting that as a divergence would make the feature useless the moment it is unwired. */}
      {liveAvailable && divergences.length > 0 && (
        <p className="bz-divergence">
          <StatusGlyph rag="amber" label="divergence" /> {divergences.length} declaring healthy but
          silent: {divergences.map((d) => <Chip key={d} tone="warn">{d}</Chip>)}
        </p>
      )}

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
      {changeSummary.published && topChanges.length > 0 && (
        <section>
          <div className="bz-section-head">
            <h2>Contract changes</h2>
            <span className="bz-page-note">against each topic’s previous version</span>
            <button
              type="button"
              className="bz-section-more"
              onClick={() => dispatch(navigated({ page: 'changes' }))}
            >
              see all {allChanges.length} →
            </button>
          </div>
          <ul className="bz-ledger">
            {topChanges.map((change) => (
              <li
                key={`${change.topic}@${change.version}:${change.path}:${change.kind}`}
                className="bz-change bz-ledger-row"
                data-verdict={change.compatibility}
              >
                <VerdictBadge verdict={change.compatibility} attribute={false} />
                <button
                  type="button"
                  className="bz-topic-name"
                  onClick={() => dispatch(navigated({
                    page: 'topic', selected: change.topic, selectedVersion: change.version,
                  }))}
                >
                  {change.topic}
                  <span className="bz-topic-version">
                    {change.baselineVersion ? `${change.baselineVersion} → ${change.version}` : change.version}
                  </span>
                </button>
                <span className="bz-change-side">{change.direction}</span>
                <code className="bz-change-path" title={change.path}>{shortPath(change.path)}</code>
                <span className="bz-change-desc">{change.description}</span>
              </li>
            ))}
          </ul>
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

      {flows.available && (
        <section>
          <h2>Recent flows</h2>
          <FlowList
            view={flows}
            failingOnly={failingOnly}
            onToggleFailing={() => dispatch(failingFlowsToggled())}
            onOpenService={openService}
          />
        </section>
      )}

      {/* The functional map: what these services actually do. The product's first question, and
          until now answerable only by opening every service in turn.
          This also subsumes the old "topics needing attention" list — every flagged topic is a row
          here with its status, so keeping a second surface for the same rows was duplication, and
          duplication is how the page this replaced grew to five thousand lines. */}
      <CollapsibleSection
        id="topics"
        title="Topics"
        note={flagged.length > 0 ? `${flagged.length} flagged` : undefined}
        open={isOpen('topics')}
        onToggle={toggle}
      >
        <TopicCatalog />
      </CollapsibleSection>

      <CollapsibleSection
        id="topology"
        title="Topology"
        open={isOpen('topology', true)}
        onToggle={toggle}
      >
        <TopologyGraph edges={edges} rags={rags} onOpen={openService} />
      </CollapsibleSection>
    </div>
  );
}
