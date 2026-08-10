import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectRetirementView, selectShowUtility } from '../../store/selectors';
import { navigated, utilityToggled } from '../../store/slices/viewSlice';
import { RetirementRow } from '../controls/RetirementRow';
import { PageHead } from '../controls/PageHead';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { EmptyState } from '../primitives/EmptyState';

/**
 * What the estate could retire, and the evidence for each case.
 *
 * This is the page an estate owner comes to with a decision to make, so its job is to hand them the
 * case rather than the verdict. The header states the strongest thing the available data can support
 * and no more: without a usage feed, "unused" cannot be proven here at all, and saying so is the
 * difference between a tool that informs a retirement and one that causes an outage.
 */
export function ValuePage() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectRetirementView);
  const showUtility = useAppSelector(selectShowUtility);

  const openTopic = (topic: string) => dispatch(navigated({ page: 'topic', selected: topic }));
  const nothingToShow = view.removed.length === 0 && view.groups.length === 0;

  return (
    <div className="bz-page">
      <PageHead
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title="Value"
        lede={
          view.feedWired
            ? 'What the estate could retire, and the evidence for each case — structural plus observed usage, candidates first.'
            : "What the estate could retire. Structural evidence only: no usage feed is wired, so “unused” cannot be proven here."
        }
        actions={
          <button type="button" onClick={() => dispatch(utilityToggled())}>
            {showUtility ? 'hide' : 'show'} benzene utility topics
          </button>
        }
      />

      {nothingToShow && <EmptyState message="No topics are declared, so there is nothing to assess." />}

      {view.removed.length > 0 && (
        <section>
          <h3 className="bz-vd-tier" data-rag="gone">
            <StatusGlyph rag="gone" label="tier: removed" /> Removed since the previous run (
            {view.removed.length})
          </h3>
          <p className="bz-vd-sub">
            Declared in the previous aggregator run, declared nowhere now — a retirement that just
            completed, or a disappearance to confirm.
          </p>
          {view.removed.map((r) => (
            <div className="bz-vd-row" data-rag="gone" key={`${r.topic}@${r.version}`}>
              <StatusGlyph rag="gone" label="removed" />
              <span className="bz-vd-removed">
                {r.topic}
                {r.version && ` @ ${r.version}`}
              </span>
              <span className="bz-vd-evidence">no longer declared by any service</span>
            </div>
          ))}
        </section>
      )}

      {view.groups.map((group) => (
        <section key={group.tier}>
          <h3 className="bz-vd-tier" data-rag={group.rag}>
            <StatusGlyph rag={group.rag} label={`tier: ${group.tier}`} /> {group.label} (
            {group.rows.length})
          </h3>
          <p className="bz-vd-sub">{group.sub}</p>
          {group.rows.map((row) => (
            <RetirementRow
              key={`${row.entry.topic}@${row.entry.version}`}
              row={row}
              rag={group.rag}
              onOpen={openTopic}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
