import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectCatalogRows, selectCatalogTotal, selectTopicFilter, selectTopicSort, selectShowUtility,
  formatCount, versionLabel, type CatalogRow,
} from '../../store/selectors';
import { navigated, topicFilterChanged, topicSorted, utilityToggled } from '../../store/slices/viewSlice';
import { DataTable, type DataColumn } from '../primitives/DataTable';
import { EmptyState } from '../primitives/EmptyState';
import { Badge } from '../primitives/Badge';
import { VerdictBadge } from '../sections/ContractChanges';
import { Chip } from '../primitives/Chip';

/**
 * Every topic in the estate, in one table.
 *
 * This is the functional map — the product's answer to *what do these services actually do*, and
 * the guide's "centrepiece". It had no estate-level surface at all: the front door showed only
 * flagged topics, so a reader had to open each service in turn and assemble the map themselves.
 *
 * A table rather than cards because this is data a reader compares down a column — which topic
 * carries the most traffic, which have no consumer, which are reachable over HTTP. Cards make each
 * row an island; a column makes them a ranking.
 */
export function TopicCatalog() {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectCatalogRows);
  const total = useAppSelector(selectCatalogTotal);
  const filter = useAppSelector(selectTopicFilter);
  const sort = useAppSelector(selectTopicSort);
  const showUtility = useAppSelector(selectShowUtility);

  // The table renders one row per topic VERSION and shows the version in its own column, so a row
  // that opens a different version is the reader asking for one contract and silently getting
  // another — the exact defect selectTopic's own comment warns about, one layer up.
  const openTopic = (topic: string, version: string | null) =>
    dispatch(navigated({ page: 'topic', selected: topic, selectedVersion: version }));
  const openService = (service: string) => dispatch(navigated({ page: 'service', selected: service }));

  const services = (names: string[]) =>
    names.length === 0 ? (
      <span className="bz-cat-none">none</span>
    ) : (
      names.map((name) => (
        <button type="button" key={name} className="bz-cat-svc" onClick={() => openService(name)}>
          {name}
        </button>
      ))
    );

  const columns: DataColumn<CatalogRow>[] = [
    {
      key: 'topic',
      header: 'Topic',
      sortValue: (r) => r.topic,
      render: (r) => (
        <span className="bz-cat-topic-cell">
          <button type="button" className="bz-topic-name" onClick={() => openTopic(r.topic, r.version)}>
            {r.topic}
          </button>
          {r.reserved && <Chip title="A topic Benzene itself owns">reserved</Chip>}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      sortValue: (r) => r.version ?? '',
      render: (r) => versionLabel(r.version) ?? <span className="bz-cat-none">—</span>,
    },
    {
      key: 'producers',
      header: 'Producers',
      sortValue: (r) => r.producers.length,
      render: (r) => <span className="bz-cat-svcs">{services(r.producers)}</span>,
    },
    {
      key: 'consumers',
      header: 'Consumers',
      sortValue: (r) => r.consumers.length,
      render: (r) => <span className="bz-cat-svcs">{services(r.consumers)}</span>,
    },
    {
      key: 'http',
      header: 'HTTP',
      render: (r) =>
        r.httpMappings.length === 0 ? (
          // Not a gap: most topics are message-only, and that is the normal case, not a lack.
          <span className="bz-cat-none">—</span>
        ) : (
          r.httpMappings.map((m) => (
            <Chip key={`${m.method} ${m.path}`}>{m.method.toUpperCase()} {m.path}</Chip>
          ))
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status ?? '',
      render: (r) => (
        <>
          {r.status && (
            <Badge rag={r.status === 'gap' ? 'amber' : 'red'}>{r.status.replace(/-/g, ' ')}</Badge>
          )}
          {r.schemaMismatch && <Badge rag="red">schema mismatch</Badge>}
          {/* A breaking contract change belongs in the column a reader scans for "is this row a
              problem". Without it this cell read `ok` on the row that deletes a live address field —
              a lifecycle word doing duty as a health word, in a table of health columns. */}
          {r.verdict && r.verdict !== 'compatible' && (
            <VerdictBadge verdict={r.verdict} attribute={false} />
          )}
          {!r.status && !r.schemaMismatch && !r.verdict && <span className="bz-cat-none">ok</span>}
        </>
      ),
    },
    {
      key: 'traffic',
      header: 'Traffic',
      numeric: true,
      // Unmeasured sorts below zero, so "nothing is measuring this" never outranks a real count.
      sortValue: (r) => r.traffic ?? -1,
      render: (r) =>
        r.traffic == null ? (
          <span className="bz-cat-none" title="No usage feed is wired, so traffic is unknown">
            —
          </span>
        ) : (
          <span
            title={r.version && !r.trafficVersionAttributed
              ? `The whole topic's traffic. The usage feed does not break it down by version, so none of it is attributed to ${r.version}.`
              : undefined}
          >
            {formatCount(r.traffic)}
            {/* The dagger marks a figure that is NOT this row's version. Without it the column reads
                as per-version and sums to roughly double the estate's real traffic. */}
            {r.version && !r.trafficVersionAttributed && <span className="bz-cat-none">†</span>}
          </span>
        ),
    },
  ];

  return (
    <div className="bz-catalog">
      <div className="bz-catalog-controls">
        <input
          className="bz-catalog-filter"
          aria-label="Filter topics"
          placeholder="Filter topics or services…"
          value={filter}
          onChange={(e) => dispatch(topicFilterChanged(e.target.value))}
        />
        <button type="button" onClick={() => dispatch(utilityToggled())}>
          {showUtility ? 'hide' : 'show'} benzene utilities
        </button>
        {filter.trim() !== '' && (
          <span className="bz-catalog-count">
            {rows.length} of {total}
          </span>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.topic}@${r.version ?? ''}`}
        sort={sort}
        onSort={(key) => dispatch(topicSorted(key))}
        empty={
          filter.trim() !== '' ? (
            <EmptyState message={`No topic or service matches “${filter}”.`} />
          ) : (
            <EmptyState
              message="No topics are published. The aggregator has run but no service declared one."
              tone="unknown"
            />
          )
        }
      />
    </div>
  );
}
