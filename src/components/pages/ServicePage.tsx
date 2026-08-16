import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopicsForService, selectEdgesForService, selectLiveness, selectIssuesForService,
  selectFleetAvailable, ragForStatus, selectThread, selectCanPost, selectCanAnnotate,
  selectServiceAbout, selectUsageForService, selectShowUtility, selectFeedHealth,
  selectFlowsForService, selectFailingFlowsOnly, selectServiceChangeSummary,
} from '../../store/selectors';
import { navigated, utilityToggled, failingFlowsToggled, changeServiceFiltered,
} from '../../store/slices/viewSlice';
import { draftChanged, draftAuthorChanged, postAnnotation } from '../../store/slices/annotationsSlice';
import { TopicList } from '../controls/TopicList';
import { EdgeList } from '../controls/EdgeList';
import { LiveStrip } from '../controls/LiveStrip';
import { IssueRow } from '../controls/IssueRow';
import { FeedHealthLine } from '../controls/FeedHealthLine';
import { FlowList } from '../controls/FlowList';
import { ServiceAbout, ServiceLiveness } from '../sections/ServiceAbout';
import { ServiceDrift } from '../sections/ServiceDrift';
import { Card } from '../primitives/Card';
import { ServiceUsage } from '../sections/ServiceUsage';
import { HealthChecks } from '../sections/HealthChecks';
import { Thread } from '../sections/Thread';
import { Composer } from '../sections/Composer';
import { PageHead } from '../controls/PageHead';
import { Badge } from '../primitives/Badge';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';
import type { RootState } from '../../store/store';

export interface ServicePageProps {
  service: string;
}

export function ServicePage({ service }: ServicePageProps) {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s: RootState) => s.estate.services.find((x) => x.name === service));
  const snapshot = useAppSelector((s: RootState) => s.estate.snapshots[service] ?? null);
  const topics = useAppSelector((s: RootState) => selectTopicsForService(s, service));
  const edges = useAppSelector((s: RootState) => selectEdgesForService(s, service));
  const liveness = useAppSelector((s: RootState) => selectLiveness(s, service));
  const issues = useAppSelector((s: RootState) => selectIssuesForService(s, service));
  const live = useAppSelector(selectFleetAvailable);
  const entity = `service:${service}`;
  const thread = useAppSelector((s: RootState) => selectThread(s, entity));
  const canPost = useAppSelector(selectCanPost);
  const annotations = useAppSelector((s: RootState) => s.annotations);
  const writable = useAppSelector(selectCanAnnotate);
  const about = useAppSelector((s: RootState) => selectServiceAbout(s, service));
  const usage = useAppSelector((s: RootState) => selectUsageForService(s, service));
  const showUtility = useAppSelector(selectShowUtility);
  const feedHealth = useAppSelector(selectFeedHealth);
  const flows = useAppSelector((s: RootState) => selectFlowsForService(s, service));
  const failingOnly = useAppSelector(selectFailingFlowsOnly);
  const contractChanges = useAppSelector((s: RootState) => selectServiceChangeSummary(s, service));
  // Filtered to this service. The card says "2 changes across 2 topics"; handing the reader all 10
  // and making them reconstruct their own subset is the cross-referencing the ledger existed to end.
  const viewChanges = () => {
    dispatch(navigated({ page: 'changes' }));
    dispatch(changeServiceFiltered(service));
  };

  if (!entry) {
    return <EmptyState message={`${service} is not in the estate manifest.`} />;
  }

  const open = (name: string) => dispatch(navigated({ page: 'service', selected: name }));
  const openTopic = (topic: string, version?: string) =>
    dispatch(navigated({ page: 'topic', selected: topic, selectedVersion: version ?? null }));

  return (
    <div className="bz-page">
      <PageHead
        mono
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title={service}
        lede="What this service declares it does, what the collector has observed it doing, and where the two disagree."
        badges={
          <>
            <Badge rag={ragForStatus(entry.status)}>{entry.status}</Badge>
            {entry.contractDrift && <Badge rag="amber" title="The published spec changed since the last snapshot">drift</Badge>}
            {entry.owningTeam && <Chip tone="accent">{entry.owningTeam}</Chip>}
          </>
        }
        actions={live ? <LiveStrip liveness={liveness} issueCount={issues.reduce((n, i) => n + i.count, 0)} diverged={entry.status === 'healthy' && liveness === 'stale'} /> : undefined}
      />

      <FeedHealthLine health={feedHealth} />

      {/* CONTRACT — what this service's shape is, and whether it moved. Grouped first and together
          because that is the question a reader opens a service page to answer; it used to be split
          across two sections with the health and usage panels in between. */}
      <Card title="Contract">
        <ServiceAbout about={about} />
        <ServiceDrift drift={about?.drift ?? null} changes={contractChanges} onViewChanges={viewChanges} />
        <div className="bz-svc-topics">
          <div>
            <h4>Consumes</h4>
            <TopicList topics={topics.consumes} emptyMessage="Consumes nothing." onOpen={openTopic} />
          </div>
          <div>
            <h4>Produces</h4>
            <TopicList topics={topics.produces} emptyMessage="Produces nothing." onOpen={openTopic} />
          </div>
        </div>
      </Card>

      {/* CALLS — deliberately its own card rather than merged into Contract. Readers took a produced
          topic for an outbound call when the two sat under peer headings; merging them would make
          that reading correct-looking rather than fixing it. */}
      <Card title="Calls">
        {/* mesh.md §4: the edge list is the declared graph (`consumes`/`topics`), not trace-derived —
            an empty list means no service has registered the other end, never "nothing observed". */}
        <h4>Outbound</h4>
        <EdgeList edges={edges.outbound} show="server" emptyMessage="Declares no outbound calls." onOpen={open} />
        <h4>Inbound</h4>
        <EdgeList edges={edges.inbound} show="client" emptyMessage="No service declares a call to this one." onOpen={open} />
      </Card>

      {/* STATE — everything about this instant, including when the snapshot was taken. That row used
          to sit in About, directly above the drift line, which is precisely why the line that decides
          a release read as a timestamp. */}
      <Card title="State">
        <ServiceLiveness about={about} liveness={live ? liveness : null} />
        <HealthChecks snapshot={snapshot} />
      </Card>

      <Card title="Traffic">
        <ServiceUsage
          usage={usage}
          showUtility={showUtility}
          onToggleUtility={() => dispatch(utilityToggled())}
        />
        {live && (
          <>
            <h4>Flows</h4>
            <FlowList
              view={flows}
              failingOnly={failingOnly}
              subject={service}
              onToggleFailing={() => dispatch(failingFlowsToggled())}
              onOpenService={open}
            />
          </>
        )}
      </Card>

      {live && (
        <Card title="Issues">
          {issues.length === 0 ? (
            <EmptyState message="No issues observed for this service." tone="clear" />
          ) : (
            issues.map((i) => (
              <IssueRow
                key={i.fingerprint}
                issue={i}
                onOpen={(fingerprint) => dispatch(navigated({ page: 'issue', selected: fingerprint }))}
              />
            ))
          )}
        </Card>
      )}

      <Card title="Discussion">
        <Thread annotations={thread} />
        <Composer
          draft={annotations.draft}
          author={annotations.draftAuthor}
          canPost={canPost}
          posting={annotations.post === 'posting'}
          error={annotations.postError}
          onDraftChange={(t) => dispatch(draftChanged(t))}
          onAuthorChange={(a) => dispatch(draftAuthorChanged(a))}
          {...(writable
            ? {
                onPost: () =>
                  void dispatch(
                    postAnnotation({ entity, author: annotations.draftAuthor, text: annotations.draft }),
                  ),
              }
            : {})}
        />
      </Card>
    </div>
  );
}
