import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectChangeSummary, selectFlaggedTopics, selectEdges, selectServiceRags, selectCollapsedSections,
} from '../../store/selectors';
import { navigated, sectionToggled } from '../../store/slices/viewSlice';
import { TopicCatalog } from '../containers/TopicCatalog';
import { TopologyGraph } from '../sections/TopologyGraph';
import { CollapsibleSection } from '../controls/CollapsibleSection';
import { PageHead } from '../controls/PageHead';

/**
 * The estate's functional map — every topic, who is on each end, and what state it is in.
 *
 * A destination in its own right, which it had never been: the catalogue was a collapsed section at
 * the bottom of the estate page with no route, so the product's answer to "what does this estate
 * actually do?" — aim 1, and the first question a business analyst or a joining developer asks —
 * could not be linked to, bookmarked, or navigated to. It also does not belong on the estate page,
 * which owns a different question ("what should I look at first?").
 *
 * Topology sits under it, collapsed, and stays deliberately under-invested in: a node-and-edge
 * picture is legible at ten services and useless at a hundred, so it is a small-estate affordance
 * rather than the surface this page is built around.
 */
export function TopicsPage() {
  const dispatch = useAppDispatch();
  const flagged = useAppSelector(selectFlaggedTopics);
  const changeSummary = useAppSelector(selectChangeSummary);
  const edges = useAppSelector(selectEdges);
  const rags = useAppSelector(selectServiceRags);
  // Collapsed-by-default: the flag inverts rather than seeding the store, so a reader who opens it
  // keeps it open without the store carrying a special case.
  const collapsed = useAppSelector(selectCollapsedSections);
  const toggle = (id: string) => dispatch(sectionToggled(id));
  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  const flaggedCount = flagged.length + changeSummary.changedVersions;

  return (
    <div className="bz-page">
      <PageHead
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title="Topics"
        lede="Every message this estate carries, who handles it, who sends it, and what state it is in."
      />

      {/* Counts everything the table badges, not just the lifecycle `status` field — the verdict
          badges live in the same column, so a count that ignored them would sit directly above its
          own contradicting evidence. */}
      {flaggedCount > 0 && (
        <p className="bz-page-note">{flaggedCount} flagged</p>
      )}

      <TopicCatalog />

      <CollapsibleSection
        id="topology"
        title="Topology"
        open={collapsed.includes('topology')}
        onToggle={toggle}
      >
        <TopologyGraph edges={edges} rags={rags} onOpen={openService} />
      </CollapsibleSection>
    </div>
  );
}
