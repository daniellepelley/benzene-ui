import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectEstateSummary, selectDivergences, selectIssueSummary, selectFleetAvailable,
  selectFlaggedTopics, selectEdges, selectFlows, selectFailingFlowsOnly, selectInboxIssues,
  selectServiceRags,
} from '../../store/selectors';
import { navigated, failingFlowsToggled } from '../../store/slices/viewSlice';
import { ServiceList } from '../containers/ServiceList';
import { TopologyGraph } from '../sections/TopologyGraph';
import { TopicList } from '../controls/TopicList';
import { FlowList } from '../controls/FlowList';
import { EstateStats } from '../controls/EstateStats';
import { IssueRow } from '../controls/IssueRow';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';

/** How many issues the front door shows before handing off to the full inbox. */
const INBOX_PREVIEW = 5;

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

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  const stats = [
    { key: 'total', value: summary.total, label: 'Services' },
    { key: 'red', value: summary.counts.red, label: 'Unhealthy', rag: 'red' as const },
    { key: 'amber', value: summary.counts.amber, label: 'Degraded', rag: 'amber' as const },
    { key: 'gone', value: summary.counts.gone, label: 'Unreachable', rag: 'gone' as const },
    { key: 'drift', value: summary.drift, label: 'Contract drift', rag: 'amber' as const },
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

      <section>
        <h2>Services</h2>
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

      {flagged.length > 0 && (
        <section>
          <h2>Topics needing attention</h2>
          <TopicList topics={flagged} emptyMessage="Nothing flagged."
            onOpen={(topic) => dispatch(navigated({ page: 'topic', selected: topic }))} />
        </section>
      )}

      <section>
        <h2>Topology</h2>
        <TopologyGraph edges={edges} rags={rags} onOpen={openService} />
      </section>
    </div>
  );
}
