import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectAllChanges, selectUnclassifiedChanges, selectChangeSummary, selectComparisonsPublished,
  selectRollouts, selectOutstandingByService, VERDICT_ORDER, type LedgerChange,
} from '../../store/selectors';
import {
  navigated, changeFilterChanged, changeServiceFiltered, changeVerdictFiltered, changeStateFiltered,
  changeModeSelected,
} from '../../store/slices/viewSlice';
import { PageHead } from '../controls/PageHead';
import { EmptyState } from '../primitives/EmptyState';
import { VerdictBadge, shortPath } from '../sections/ContractChanges';
import { RolloutList } from '../sections/RolloutList';
import {
  BY_SERVICE_SCOPE, NOT_PUBLISHED_COPY, NO_RELEASE_TRAIN_COPY, POLLED_INSTANCE_CAVEAT,
  ROLLOUT_SCOPE_CAVEAT, ROLLOUT_STATE_HELP, ROLLOUT_STATE_LABEL, SCOPE_CAVEAT,
  UNCLASSIFIED_GROUP_COPY, VERDICT_LABEL,
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
  const mode = useAppSelector((s: RootState) => s.view.changeMode);
  const state = useAppSelector((s: RootState) => s.view.changeState);
  const rollouts = useAppSelector(selectRollouts);
  const byService = useAppSelector(selectOutstandingByService);

  // The union of both sides, not just whoever is on the changed entry. Built from `services` alone,
  // this list silently omitted exactly the population a release review is trying to enumerate — the
  // services that are LATE, which by definition appear on no changed entry.
  const services = [...new Set(changes.flatMap((c) => [...c.services, ...c.outstanding]))].sort();
  const needle = filter.trim().toLowerCase();
  const matching = changes.filter((c) =>
    (!service || c.services.includes(service) || c.outstanding.includes(service))
    && (!verdict || c.compatibility === verdict)
    // Matching the SERVICE name here too, because a reader who types "payments-api" into a box on a
    // page listing changes means "changes involving payments-api" — and being told "0 changes, 10
    // hidden" for a service that plainly has changes teaches them the filter is broken.
    && (!needle
      || c.topic.toLowerCase().includes(needle)
      || c.path.toLowerCase().includes(needle)
      || [...c.services, ...c.outstanding].some((name) => name.toLowerCase().includes(needle))));

  // The rollouts grain uses the SAME service and text filters — they mean the same thing at both
  // grains, and dropping them on a mode switch would make the switch feel like a navigation.
  const matchingRollouts = rollouts.filter((r) =>
    (!service || r.moved.includes(service) || r.outstanding.includes(service))
    && (!state || r.state === state)
    && (!needle
      || r.topic.toLowerCase().includes(needle)
      || [...r.moved, ...r.outstanding].some((name) => name.toLowerCase().includes(needle))));

  // Not "how many topics changed" — how many topics still need somebody to do something. A breaking
  // change that has been versioned out contributes nothing to this number, which is the whole point.
  const outstandingCount = rollouts.filter((r) => r.outstanding.length > 0).length;

  const openTopic = (topic: string, version: string) =>
    dispatch(navigated({ page: 'topic', selected: topic, selectedVersion: version }));
  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  return (
    <div className="bz-page">
      <PageHead
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title="Contract changes"
        lede={mode === 'rollouts'
          ? 'Which topic versions are covered on both sides, and who still owes a move.'
          : 'What changed in the estate’s payload contracts, and whether it breaks a consumer.'}
      />

      {/* One route, two grains. A change is a FIELD and a rollout is a TOPIC — different objects
          over the same evidence, so splitting them across two hashes would split the evidence and
          the filters with it. Rollouts leads because "who owes a deploy" is the question a reader
          arrives with; the field-level diff is what they open next. */}
      <div className="bz-mode-switch" role="group" aria-label="Change view">
        {(['rollouts', 'changes'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            data-active={mode === m ? 'true' : undefined}
            onClick={() => dispatch(changeModeSelected(m))}
          >
            {m === 'rollouts' ? 'Rollouts' : 'Field changes'}
          </button>
        ))}
      </div>

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
            {mode === 'rollouts' && (
              // Not "how many changed" — how many still need somebody to do something. A breaking
              // change that has been versioned out contributes nothing here, which is the point.
              <span className="bz-changes-count" data-verdict={outstandingCount > 0 ? 'breaking' : undefined}>
                {outstandingCount} of {rollouts.length} awaiting a move
              </span>
            )}
            {mode === 'changes' && VERDICT_ORDER.filter((v) => v !== 'notCompared').map((verdict) =>
              summary.counts[verdict] ? (
                <span key={verdict} className="bz-changes-count" data-verdict={verdict}>
                  <VerdictBadge verdict={verdict} attribute={false} /> {summary.counts[verdict]}
                </span>
              ) : null,
            )}
            {mode === 'changes' && summary.notCompared > 0 && (
              // Spelled out, because "not compared" also appears on a topic page meaning "a type
              // changed so fields beneath it were not walked". Same phrase, different subject — the
              // unit has to be on the chip or the two readings collide.
              <span className="bz-changes-count" title="Topics with a single published version, so there is no pair to compare">
                {summary.notCompared} topic{summary.notCompared === 1 ? '' : 's'} not compared
              </span>
            )}
          </p>

          <div className="bz-section-head">
            <h2>
              {mode === 'rollouts'
                ? `${matchingRollouts.length} rollout${matchingRollouts.length === 1 ? '' : 's'}`
                : `${matching.length} change${matching.length === 1 ? '' : 's'}`}
            </h2>
            <select
              className="bz-catalog-filter"
              aria-label="Filter changes by service"
              value={service ?? ''}
              onChange={(e) => dispatch(changeServiceFiltered(e.target.value || null))}
            >
              <option value="">All services</option>
              {services.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {mode === 'rollouts' ? (
              <select
                className="bz-catalog-filter"
                aria-label="Filter rollouts by state"
                value={state ?? ''}
                onChange={(e) => dispatch(changeStateFiltered(e.target.value || null))}
              >
                <option value="">All states</option>
                {Object.entries(ROLLOUT_STATE_LABEL).map(([key, label]) => (
                  // The labels were being reverse-engineered from which verdicts happened to carry
                  // them — "move outstanding" and "completion outstanding" are a real distinction
                  // and nothing on screen defined it.
                  <option key={key} value={key} title={ROLLOUT_STATE_HELP[key]}>{label}</option>
                ))}
              </select>
            ) : (
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
            )}
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
              Showing changes that reach <strong>{service}</strong> or that it still owes a move on.
              A service listed under <em>moved</em> declares the newer version already; one listed
              under <em>owes</em> declares only the older one, in the role that has to change.
              Neither names an author — the catalogue records who is on each end of a topic, not
              whose declaration moved.
            </p>
          )}

          {/* GROUPED BY THE SERVICE THAT OWES, which is the axis the people planning a release
              actually work on. Two roles asked for this from opposite directions in the same round
              — "how many teams do I book" and "who is the bottleneck" — and both were assembling it
              by hand, one service page at a time.

              This is NOT the transitive coordination set, which stays refused: that closure
              collapses to the whole estate once a service is a hub. This is bounded by the number of
              services, a hub that has already moved simply has no row, and it asserts no coupling
              the catalogue cannot see. */}
          {mode === 'rollouts' && byService.length > 0 && !service && !state && (
            <section className="bz-by-service">
              <div className="bz-section-head">
                <h3>Outstanding by service</h3>
                <span className="bz-page-note">
                  {byService.length} service{byService.length === 1 ? '' : 's'} owe
                  {byService.length === 1 ? 's' : ''} a contract move
                </span>
              </div>
              <ul className="bz-by-service-list">
                {byService.map((row) => (
                  <li key={row.service}>
                    <button type="button" className="bz-cat-svc"
                      onClick={() => dispatch(changeServiceFiltered(row.service))}>
                      {row.service}
                    </button>
                    <span className="bz-by-service-count">
                      {row.moves.length} move{row.moves.length === 1 ? '' : 's'}
                    </span>
                    <span className="bz-by-service-topics">
                      {row.moves.map((m) => `${m.verb} on ${m.topic}`).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="bz-muted bz-changes-caveat">{BY_SERVICE_SCOPE}</p>
            </section>
          )}

          {mode === 'rollouts' && <p className="bz-page-note">{NO_RELEASE_TRAIN_COPY}</p>}

          {mode === 'rollouts' ? (
            /* Four empty states, because they lead to four different actions and only one of them
               means the estate is quiet. */
            rollouts.length === 0 ? (
              <EmptyState message="Every topic in this estate publishes one version, so there is nothing to roll out." />
            ) : matchingRollouts.length === 0 ? (
              <EmptyState message={`No rollout matches the current filter. ${rollouts.length} are hidden.`} />
            ) : (
              <RolloutList
                rollouts={matchingRollouts}
                onOpenTopic={openTopic}
                onOpenService={openService}
              />
            )
          ) : changes.length === 0 ? (
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
                  onOpenService={openService}
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

      <p className="bz-muted bz-changes-caveat">
        {mode === 'rollouts' ? ROLLOUT_SCOPE_CAVEAT : SCOPE_CAVEAT}
      </p>
      {mode === 'rollouts' && <p className="bz-muted bz-changes-caveat">{POLLED_INSTANCE_CAVEAT}</p>}
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
      <VerdictBadge verdict={change.compatibility} attribute={false} baseline={change.baselineVersion} />
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
      {/* Which services this reaches, split by which side of it they are on. The single
          undifferentiated list was built from the entry carrying the change — the version that
          already exists — so it named whoever had FINISHED the work, while the service that owed it
          rendered clean and could not even be selected in the filter above. */}
      <span className="bz-change-services">
        {change.outstanding.length > 0 && (
          <span className="bz-change-party" data-party="outstanding">
            <span className="bz-change-party-label">owes</span>
            {change.outstanding.map((name) => (
              <button key={name} type="button" className="bz-cat-svc" data-outstanding="true"
                onClick={() => onOpenService(name)}>
                {name}
              </button>
            ))}
          </span>
        )}
        {change.moved.length > 0 && (
          <span className="bz-change-party" data-party="moved">
            <span className="bz-change-party-label">moved</span>
            {change.moved.map((name) => (
              <button key={name} type="button" className="bz-cat-svc" onClick={() => onOpenService(name)}>
                {name}
              </button>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

/** Exported for the estate preview, so both surfaces rank identically. */
export { VERDICT_LABEL };
