import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopicsForService, selectEdgesForService, selectLiveness, selectIssuesForService,
  selectFleetAvailable, ragForStatus, selectThread, selectCanPost, selectCanAnnotate,
  selectServiceAbout, selectUsageForService, selectShowUtility, selectFeedHealth,
} from '../../store/selectors';
import { navigated, utilityToggled } from '../../store/slices/viewSlice';
import { draftChanged, draftAuthorChanged, postAnnotation } from '../../store/slices/annotationsSlice';
import { TopicList } from '../controls/TopicList';
import { EdgeList } from '../controls/EdgeList';
import { LiveStrip } from '../controls/LiveStrip';
import { IssueRow } from '../controls/IssueRow';
import { FeedHealthLine } from '../controls/FeedHealthLine';
import { ServiceAbout } from '../sections/ServiceAbout';
import { ServiceUsage } from '../sections/ServiceUsage';
import { HealthChecks } from '../sections/HealthChecks';
import { Thread } from '../sections/Thread';
import { Composer } from '../sections/Composer';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { EmptyState } from '../primitives/EmptyState';
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

  if (!entry) {
    return <EmptyState message={`${service} is not in the estate manifest.`} />;
  }

  const open = (name: string) => dispatch(navigated({ page: 'service', selected: name }));
  const openTopic = (topic: string) => dispatch(navigated({ page: 'topic', selected: topic }));

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <StatusGlyph rag={ragForStatus(entry.status)} />
        <h2>{service}</h2>
        {live && <LiveStrip liveness={liveness} issueCount={issues.reduce((n, i) => n + i.count, 0)} diverged={entry.status === 'healthy' && liveness === 'stale'} />}
      </header>

      <FeedHealthLine health={feedHealth} />

      <section>
        <h3>About</h3>
        <ServiceAbout about={about} liveness={live ? liveness : null} />
      </section>

      <section><h3>Health</h3><HealthChecks snapshot={snapshot} /></section>

      <section>
        <h3>Usage</h3>
        <ServiceUsage
          usage={usage}
          showUtility={showUtility}
          onToggleUtility={() => dispatch(utilityToggled())}
        />
      </section>

      <section>
        <h3>Topics</h3>
        <h4>Consumes</h4>
        <TopicList topics={topics.consumes} emptyMessage="Consumes nothing." onOpen={openTopic} />
        <h4>Produces</h4>
        <TopicList topics={topics.produces} emptyMessage="Produces nothing." onOpen={openTopic} />
      </section>

      <section>
        <h3>Calls</h3>
        <h4>Outbound</h4>
        <EdgeList edges={edges.outbound} show="server" emptyMessage="Calls nothing observed." onOpen={open} />
        <h4>Inbound</h4>
        <EdgeList edges={edges.inbound} show="client" emptyMessage="Nothing observed calling this." onOpen={open} />
      </section>

      {live && (
        <section>
          <h3>Issues</h3>
          {issues.length === 0 ? (
            <EmptyState message="No issues observed for this service." />
          ) : (
            issues.map((i) => <IssueRow key={i.id} issue={i} onOpen={(id) => dispatch(navigated({ page: 'issue', selected: id }))} />)
          )}
        </section>
      )}

      <section>
        <h3>Discussion</h3>
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
      </section>
    </div>
  );
}
