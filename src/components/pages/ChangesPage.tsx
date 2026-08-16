import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectAllChanges, selectUnclassifiedChanges, selectChangeSummary, selectComparisonsPublished,
  VERDICT_ORDER, type LedgerChange,
} from '../../store/selectors';
import {
  navigated, changeFilterChanged, changeServiceFiltered, changeVerdictFiltered,
} from '../../store/slices/viewSlice';
import { PageHead } from '../controls/PageHead';
import { EmptyState } from '../primitives/EmptyState';
import { VerdictBadge, shortPath } from '../sections/ContractChanges';
import {
  NOT_PUBLISHED_COPY, SCOPE_CAVEAT, UNCLASSIFIED_GROUP_COPY, VERDICT_LABEL,
} from '../sections/compatibilityCopy';
import type { RootState } from '../../store/store';

/**
 * Every contract change in the estate, ranked worst first.
 *
 * This is the object an architect asked for and the product did not have: change existed only as a
 * chip on individual rows of a retirement screen, so "how many contracts changed, how many break, and
 * who owns them" was unanswerable without visiting every topic page. It is a *view*, not new data —
 * a selector over `topics[].compatibility` — so it costs the artifact nothing and the navigation
 * model only one hash.
 *
 * The three empty states are the point, not an afterthought. "Nothing changed", "not computed" and
 * "your filter matched nothing" lead to completely different actions, and collapsing them into one
 * blank screen is how a reader concludes an estate is quiet when the tool simply never looked.
 */
export function ChangesPage() {
  const dispatch = useAppDispatch();
  const changes = useAppSelector(selectAllChanges);
  const unclassified = useAppSelector(selectUnclassifiedChanges);
  const summary = useAppSelector(selectChangeSummary);
  const published = useAppSelector(selectComparisonsPublished);
  const generatedAt = useAppSelector((s: RootState) => s.catalog.topics?.generatedAtUtc ?? null);
  const filter = useAppSelector((s: RootState) => s.view.changeFilter);
  const service = useAppSelector((s: RootState) => s.view.changeService);
  const verdict = useAppSelector((s: RootState) => s.view.changeVerdict);

  const services = [...new Set(changes.flatMap((c) => c.services))].sort();
  const needle = filter.trim().toLowerCase();
  const matching = changes.filter((c) =>
    (!service || c.services.includes(service))
    && (!verdict || c.compatibility === verdict)
    // Matching the SERVICE name here too, because a reader who types "payments-api" into a box on a
    // page listing changes means "changes involving payments-api" — and being told "0 changes, 10
    // hidden" for a service that plainly has changes teaches them the filter is broken.
    && (!needle
      || c.topic.toLowerCase().includes(needle)
      || c.path.toLowerCase().includes(needle)
      || c.services.some((name) => name.toLowerCase().includes(needle))));

  const openTopic = (topic: string, version: string) =>
    dispatch(navigated({ page: 'topic', selected: topic, selectedVersion: version }));

  return (
    <div className="bz-page">
      <PageHead
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title="Contract changes"
        lede="What changed in the estate’s payload contracts, and whether it breaks a consumer."
      />

      {/* Provenance, always. A reader has to know what was compared against what before a count means
          anything — and this is the sentence that stops the ledger being read as "since yesterday". */}
      <p className="bz-page-note">
        Comparing each topic version against the version published before it, in the catalogue
        published{generatedAt ? ` at ${generatedAt}` : ''}.
      </p>

      {!published ? (
        <EmptyState message={NOT_PUBLISHED_COPY} />
      ) : (
        <>
          <p className="bz-changes-summary">
            {VERDICT_ORDER.filter((v) => v !== 'notCompared').map((verdict) =>
              summary.counts[verdict] ? (
                <span key={verdict} className="bz-changes-count" data-verdict={verdict}>
                  <VerdictBadge verdict={verdict} attribute={false} /> {summary.counts[verdict]}
                </span>
              ) : null,
            )}
            {summary.notCompared > 0 && (
              // Spelled out, because "not compared" also appears on a topic page meaning "a type
              // changed so fields beneath it were not walked". Same phrase, different subject — the
              // unit has to be on the chip or the two readings collide.
              <span className="bz-changes-count" title="Topics with a single published version, so there is no pair to compare">
                {summary.notCompared} topic{summary.notCompared === 1 ? '' : 's'} not compared
              </span>
            )}
          </p>

          <div className="bz-section-head">
            <h2>{matching.length} change{matching.length === 1 ? '' : 's'}</h2>
            <select
              className="bz-catalog-filter"
              aria-label="Filter changes by service"
              value={service ?? ''}
              onChange={(e) => dispatch(changeServiceFiltered(e.target.value || null))}
            >
              <option value="">All services</option>
              {services.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              className="bz-catalog-filter"
              aria-label="Filter changes by verdict"
              value={verdict ?? ''}
              onChange={(e) => dispatch(changeVerdictFiltered(e.target.value || null))}
            >
              <option value="">All verdicts</option>
              {['breaking', 'warning', 'compatible'].map((v) => (
                <option key={v} value={v}>{VERDICT_LABEL[v]}</option>
              ))}
            </select>
            <input
              className="bz-catalog-filter"
              aria-label="Filter changes by topic, field or service"
              placeholder="Filter by topic, field or service…"
              value={filter}
              onChange={(e) => dispatch(changeFilterChanged(e.target.value))}
            />
          </div>

          {service && (
            <p className="bz-page-note">
              Showing changes on topics <strong>{service}</strong> produces or consumes. Attribution is
              by participation, not authorship — this is what reaches {service}, not what {service}{' '}
              changed.
            </p>
          )}

          {changes.length === 0 ? (
            <EmptyState message="No field-level change was detected between any topic version and the one before it." />
          ) : matching.length === 0 ? (
            <EmptyState message={`No change matches the current filter. ${changes.length} are hidden.`} />
          ) : (
            <ul className="bz-ledger">
              {matching.map((change) => (
                <LedgerRow
                  key={rowKey(change)}
                  change={change}
                  onOpen={openTopic}
                  onOpenService={(name) => dispatch(navigated({ page: 'service', selected: name }))}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Never sorted into the verdict buckets. An aggregator that reported "something changed" and
          could not say what has not earned a place in a ranking — filing it as compatible would be
          the absence-as-good-news defect one level up. */}
      {unclassified.length > 0 && (
        <section>
          <div className="bz-section-head">
            <h2>Changes without a verdict ({unclassified.length})</h2>
          </div>
          <p className="bz-page-note">{UNCLASSIFIED_GROUP_COPY}</p>
          <ul className="bz-ledger">
            {unclassified.map((change, i) => (
              <li key={`${change.topic}@${change.version}:${i}`} className="bz-change">
                <span className="bz-verdict">not classified</span>
                <span className="bz-change-side">{change.kind}</span>
                <button
                  type="button"
                  className="bz-topic-name"
                  onClick={() => openTopic(change.topic, change.version)}
                >
                  {change.topic}
                  <span className="bz-topic-version">{change.version}</span>
                </button>
                <span className="bz-change-desc">{change.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="bz-muted bz-changes-caveat">{SCOPE_CAVEAT}</p>
    </div>
  );
}

const rowKey = (change: LedgerChange) =>
  `${change.topic}@${change.version}:${change.path}:${change.kind}`;

function LedgerRow({
  change, onOpen, onOpenService,
}: {
  change: LedgerChange;
  onOpen: (topic: string, version: string) => void;
  onOpenService: (service: string) => void;
}) {
  return (
    <li className="bz-change bz-ledger-row" data-verdict={change.compatibility}>
      <VerdictBadge verdict={change.compatibility} attribute={false} />
      <button type="button" className="bz-topic-name" onClick={() => onOpen(change.topic, change.version)}>
        {change.topic}
        <span className="bz-topic-version">
          {change.baselineVersion ? `${change.baselineVersion} → ${change.version}` : change.version}
        </span>
      </button>
      <span className="bz-change-side">{change.direction}</span>
      <code className="bz-change-path" title={change.path}>{shortPath(change.path)}</code>
      <span className="bz-change-desc">
        {change.description}
        {change.truncated && ' — fields beneath were not compared'}
      </span>
      {/* Which services this reaches. "Is it us or them" is the first question a support engineer
          asks, and the ledger had no column for it. */}
      <span className="bz-change-services">
        {change.services.map((name) => (
          <button key={name} type="button" className="bz-cat-svc" onClick={() => onOpenService(name)}>
            {name}
          </button>
        ))}
      </span>
    </li>
  );
}

/** Exported for the estate preview, so both surfaces rank identically. */
export { VERDICT_LABEL };
