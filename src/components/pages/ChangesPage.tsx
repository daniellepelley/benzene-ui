import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectAllChanges, selectUnclassifiedChanges, selectChangeSummary, selectComparisonsPublished,
  VERDICT_ORDER, type LedgerChange,
} from '../../store/selectors';
import { navigated, topicFilterChanged } from '../../store/slices/viewSlice';
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
  const filter = useAppSelector((s: RootState) => s.view.topicFilter);

  const needle = filter.trim().toLowerCase();
  const matching = needle
    ? changes.filter((c) =>
      c.topic.toLowerCase().includes(needle) || c.path.toLowerCase().includes(needle))
    : changes;

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
              <span className="bz-changes-count">
                {summary.notCompared} not compared
              </span>
            )}
          </p>

          <div className="bz-section-head">
            <h2>{matching.length} change{matching.length === 1 ? '' : 's'}</h2>
            <input
              className="bz-catalog-filter"
              aria-label="Filter changes by topic or field"
              placeholder="Filter by topic or field…"
              value={filter}
              onChange={(e) => dispatch(topicFilterChanged(e.target.value))}
            />
          </div>

          {changes.length === 0 ? (
            <EmptyState message="No field-level change was detected between any topic version and the one before it." />
          ) : matching.length === 0 ? (
            <EmptyState message={`No change matches “${filter}”. ${changes.length} are hidden by the filter.`} />
          ) : (
            <ul className="bz-ledger">
              {matching.map((change) => (
                <LedgerRow key={rowKey(change)} change={change} onOpen={openTopic} />
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
  change, onOpen,
}: {
  change: LedgerChange;
  onOpen: (topic: string, version: string) => void;
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
    </li>
  );
}

/** Exported for the estate preview, so both surfaces rank identically. */
export { VERDICT_LABEL };
