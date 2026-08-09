import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectEstateSummary, selectDivergences, selectIssueSummary, selectFleetAvailable,
  selectFlaggedTopics, selectEdges, selectRangeMs, RANGE_OPTIONS,
} from '../../store/selectors';
import { navigated, rangeChanged } from '../../store/slices/viewSlice';
import { ServiceList } from '../containers/ServiceList';
import { TopologyGraph } from '../sections/TopologyGraph';
import { TopicList } from '../controls/TopicList';
import { RangePicker } from '../controls/RangePicker';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';

/** The estate at a glance: declared status, what the collector has observed, and the call graph. */
export function FleetPage() {
  const dispatch = useAppDispatch();
  const summary = useAppSelector(selectEstateSummary);
  const divergences = useAppSelector(selectDivergences);
  const issues = useAppSelector(selectIssueSummary);
  const liveAvailable = useAppSelector(selectFleetAvailable);
  const flagged = useAppSelector(selectFlaggedTopics);
  const edges = useAppSelector(selectEdges);
  const rangeMs = useAppSelector(selectRangeMs);

  return (
    <div className="bz-page">
      <section className="bz-rollup">
        <h2>Estate</h2>
        <RangePicker
          rangeMs={rangeMs}
          options={RANGE_OPTIONS}
          available={liveAvailable}
          onChange={(ms) => dispatch(rangeChanged(ms))}
        />
        <p>
          {summary.worst && <StatusGlyph rag={summary.worst} label={`worst: ${summary.worst}`} />}{' '}
          <strong>{summary.total}</strong> services · {summary.counts.red} unhealthy ·{' '}
          {summary.counts.amber} degraded · {summary.counts.gone} unreachable · {summary.drift} with drift
        </p>
        {/* Only meaningful with a collector — without one, every service is "never observed". */}
        {liveAvailable && divergences.length > 0 && (
          <p className="bz-divergence">
            <StatusGlyph rag="amber" label="divergence" /> {divergences.length} declaring healthy but
            silent: {divergences.map((d) => <Chip key={d}>{d}</Chip>)}
          </p>
        )}
        {liveAvailable && issues.occurrences > 0 && (
          <p>
            <button type="button" onClick={() => dispatch(navigated({ page: 'issue', selected: 'all' }))}>
              {issues.occurrences.toLocaleString()} issue occurrences ({issues.distinct} distinct)
            </button>
          </p>
        )}
      </section>

      <section>
        <h2>Services</h2>
        {/* The spec view links back here, and self-reported URLs resolve against here. */}
        <ServiceList pageUrl={typeof location === 'undefined' ? '' : location.pathname + location.search} />
      </section>

      <section>
        <h2>Topology</h2>
        <TopologyGraph
          edges={edges}
          onOpen={(name) => dispatch(navigated({ page: 'service', selected: name }))}
        />
      </section>

      {flagged.length > 0 && (
        <section>
          <h2>Topics needing attention</h2>
          <TopicList
            topics={flagged}
            emptyMessage="Nothing flagged."
            onOpen={(topic) => dispatch(navigated({ page: 'topic', selected: topic }))}
          />
        </section>
      )}
    </div>
  );
}
