import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopicsForService, selectEdgesForService, selectLiveness, selectIssuesForService,
  selectFleetAvailable, ragForStatus, selectThread, selectCanPost, selectCanAnnotate,
  selectServiceAbout, selectUsageForService, selectShowUtility, selectFeedHealth,
  selectFlowsForService, selectFailingFlowsOnly, selectServiceChangeSummary,
  selectObligationsForService, selectComparisonsPublished, selectServiceHasVersionPairs,
  selectRolloutsAwaitedByService, selectUsageWindow, selectMissingFeedsForService,
  selectObservedHealth,
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
import { ServiceOutstanding } from '../sections/ServiceOutstanding';
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
  const usageWindow = useAppSelector(selectUsageWindow);
  // Feeds the collector has DECLARED it cannot supply for this service. Read at topic grain and
  // ignored here, so a service whose collector said `["health","usage"]` rendered "Heartbeat
  // healthy", "9.8k messages observed" and "● No issues observed" — three positive assertions built
  // on feeds the plane had just said it does not have.
  const missingFeeds = useAppSelector((s: RootState) => selectMissingFeedsForService(s, service));
  // What the LIVE plane says, which is a fresher source than the manifest and was read by nothing.
  const observedHealth = useAppSelector((s: RootState) => selectObservedHealth(s, service));
  const showUtility = useAppSelector(selectShowUtility);
  const feedHealth = useAppSelector(selectFeedHealth);
  const flows = useAppSelector((s: RootState) => selectFlowsForService(s, service));
  const failingOnly = useAppSelector(selectFailingFlowsOnly);
  const contractChanges = useAppSelector((s: RootState) => selectServiceChangeSummary(s, service));
  // What this release requires of this service. The page answered "what do I declare?" and never
  // "what do I owe?", so the owner of the estate's one blocking service was told it had nothing to do.
  const obligations = useAppSelector((s: RootState) => selectObligationsForService(s, service));
  const comparisonsPublished = useAppSelector(selectComparisonsPublished);
  const hasVersionPairs = useAppSelector((s: RootState) => selectServiceHasVersionPairs(s, service));
  // The other half: what is owed TO this service. Its absence is what let the page tell the estate's
  // one unhealthy service that everything it touches was covered.
  const awaiting = useAppSelector((s: RootState) => selectRolloutsAwaitedByService(s, service));
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

      {/* The plane's own admission, at the top, before anything it governs. */}
      {missingFeeds.length > 0 && (
        <p className="bz-feed-health" data-kind="degraded">
          The collector reports no <strong>{missingFeeds.join(', ')}</strong>{' '}
          {missingFeeds.length === 1 ? 'feed' : 'feeds'} for this service, so anything below that
          would come from {missingFeeds.length === 1 ? 'it' : 'them'} is unknown rather than absent.
        </p>
      )}

      {/* Two planes, one question, and they can disagree. The manifest is a snapshot and the plane is
          now, so the reader is told BOTH rather than handed a merged verdict with the disagreement
          hidden — a service declaring healthy while the collector calls it unreachable is a finding,
          not a rendering conflict to resolve quietly. */}
      {observedHealth && entry.status && observedHealth !== entry.status && (
        <p className="bz-feed-health" data-kind="degraded">
          The manifest declares this service <strong>{entry.status}</strong>; the live plane currently
          reports it <strong>{observedHealth}</strong>. The manifest is a snapshot and the plane is
          now.
        </p>
      )}

      {/* CONTRACT — what this service's shape is, and whether it moved. Grouped first and together
          because that is the question a reader opens a service page to answer; it used to be split
          across two sections with the health and usage panels in between. */}
      <Card title="Contract">
        <ServiceAbout about={about} />
        <ServiceDrift drift={about?.drift ?? null} changes={contractChanges} onViewChanges={viewChanges} />
        {/* Above Consumes/Produces deliberately: an owner's eye lands on the first card, and what
            this release requires of them outranks what they currently declare. */}
        <ServiceOutstanding
          service={service}
          obligations={obligations}
          awaiting={awaiting}
          published={comparisonsPublished}
          hasVersionPairs={hasVersionPairs}
          onOpenTopic={openTopic}
        />
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
        <ServiceUsage window={usageWindow}
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
