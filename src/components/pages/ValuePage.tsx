import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectRetirementView, selectShowUtility } from '../../store/selectors';
import { navigated, utilityToggled } from '../../store/slices/viewSlice';
import { RetirementRow } from '../controls/RetirementRow';
import { PageHead } from '../controls/PageHead';
import { Card } from '../primitives/Card';
import { Keyline } from '../primitives/Keyline';
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

  const openTopic = (topic: string, version?: string) =>
    dispatch(navigated({ page: 'topic', selected: topic, selectedVersion: version ?? null }));
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

      {/* The card grammar the service page proved out, applied here: each tier is a bounded group
          of related rows, and its sub-line is the card's note rather than a fourth paragraph. */}
      {view.removed.length > 0 && (
        <Card
          title={`Removed since the previous run (${view.removed.length})`}
          note="Declared in the previous run, declared nowhere now — a retirement that just completed, or a disappearance to confirm."
        >
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
        </Card>
      )}

      {view.groups.map((group) => (
        <Card
          key={group.tier}
          title={`${group.label} (${group.rows.length})`}
          note={group.sub}
          actions={<StatusGlyph rag={group.rag} label={`tier: ${group.tier}`} />}
        >
          {group.rows.map((row) => (
            <RetirementRow
              key={`${row.entry.topic}@${row.entry.version}`}
              row={row}
              rag={group.rag}
              onOpen={openTopic}
            />
          ))}
        </Card>
      ))}

      {/* AN EXCLUSION, STATED. "What is this costing us / who is using it commercially" was asked
          twice in persona rounds; the mesh cannot see revenue, customers or cost, and a retirement
          argument built here is a CONTRACT-and-traffic argument. Saying so is cheaper than being
          asked a third time (mesh-ui-aims.md §4). */}
      <Keyline>
        Evidence here is declarations and observed traffic. The mesh cannot see revenue, customers or
        cost, so nothing below is a commercial case on its own.
      </Keyline>
    </div>
  );
}
