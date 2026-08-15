import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopic, selectTrafficForTopic, selectThread, selectCanPost, selectCanAnnotate,
  selectVersionCompatibility, selectHttpMappingsForTopic, selectLiveForTopic, versionLabel,
  selectFlowsForTopic, selectFailingFlowsOnly,
} from '../../store/selectors';
import { EdgeLivenessChip } from '../controls/EdgeLivenessChip';
import { navigated, failingFlowsToggled, pivotedToFailingFlows } from '../../store/slices/viewSlice';
import { draftChanged, draftAuthorChanged, postAnnotation } from '../../store/slices/annotationsSlice';
import { SchemaTree } from '../sections/SchemaTree';
import { VersionCompatibility } from '../sections/VersionCompatibility';
import { TopicLiveStrip } from '../sections/TopicLiveStrip';
import { UsagePanel } from '../controls/UsagePanel';
import { FlowList } from '../controls/FlowList';
import { Thread } from '../sections/Thread';
import { Composer } from '../sections/Composer';
import { ValueRow } from '../controls/ValueRow';
import { PageHead } from '../controls/PageHead';
import { Badge } from '../primitives/Badge';
import { Chip } from '../primitives/Chip';
import { EmptyState } from '../primitives/EmptyState';
import type { RootState } from '../../store/store';

export interface TopicPageProps {
  topic: string;
}

export function TopicPage({ topic }: TopicPageProps) {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s: RootState) => selectTopic(s, topic));
  const traffic = useAppSelector((s: RootState) => selectTrafficForTopic(s, topic));
  const entity = `topic:${topic}`;
  const thread = useAppSelector((s: RootState) => selectThread(s, entity));
  const canPost = useAppSelector(selectCanPost);
  const annotations = useAppSelector((s: RootState) => s.annotations);
  const writable = useAppSelector(selectCanAnnotate);
  const compatibility = useAppSelector((s: RootState) => selectVersionCompatibility(s, topic));
  const httpMappings = useAppSelector((s: RootState) => selectHttpMappingsForTopic(s, topic));
  const live = useAppSelector((s: RootState) => selectLiveForTopic(s, topic));
  const flows = useAppSelector((s: RootState) => selectFlowsForTopic(s, topic));
  const failingOnly = useAppSelector(selectFailingFlowsOnly);

  if (!entry) return <EmptyState message={`${topic} is not in the published catalog.`} />;

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  return (
    <div className="bz-page">
      <PageHead
        mono
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title={entry.topic}
        lede="Who produces and consumes this topic, the payload contract on it, and what traffic it has actually carried."
        badges={
          <>
            {versionLabel(entry.version) && <Chip title="Payload schema version">{versionLabel(entry.version)}</Chip>}
            {entry.reserved && <Chip title="A topic Benzene itself owns">reserved</Chip>}
            {entry.status && <Badge rag={entry.status === 'gap' ? 'amber' : 'red'} title="Flagged by the aggregator">{entry.status}</Badge>}
            {entry.schemaMismatch && <Badge rag="red" title="Producer and consumer disagree on the payload shape">schema mismatch</Badge>}
          </>
        }
        actions={
          !entry.reserved ? (
            <button type="button" onClick={() => dispatch(navigated({ page: 'compose', selected: topic }))}>
              compose a message
            </button>
          ) : undefined
        }
      />

      <section>
        <ValueRow label="Consumers">
          {entry.consumers.length === 0
            ? 'none'
            : entry.consumers.map((c) => (
                <span key={c.service} className="bz-vr-peer">
                  <button type="button" onClick={() => openService(c.service)}>
                    {c.service}
                  </button>
                  <EdgeLivenessChip activity={entry.consumerActivity?.[c.service]} />
                </span>
              ))}
        </ValueRow>
        <ValueRow label="Producers">
          {entry.producers.length === 0
            ? 'none'
            : entry.producers.map((p) => (
                <span key={p.service} className="bz-vr-peer">
                  <button type="button" onClick={() => openService(p.service)}>
                    {p.service}
                  </button>
                  <EdgeLivenessChip activity={entry.providerActivity?.[p.service]} />
                </span>
              ))}
        </ValueRow>
        {/* The wire binding — the only place a reader can see how to actually reach this topic. */}
        {httpMappings.length > 0 && (
          <ValueRow label="HTTP">
            {httpMappings.map((m, i) => (
              <Chip key={i} title={`Exposed by ${m.service}`}>
                {m.method.toUpperCase()} {m.path}
              </Chip>
            ))}
          </ValueRow>
        )}
      </section>

      <VersionCompatibility compatibility={compatibility} />

      <section>
        <h3>Traffic</h3>
        {/* Two planes, two windows. The strip states its own; the panel states the feed's. */}
        <TopicLiveStrip
          live={live}
          traffic={traffic}
          onShowFailingFlows={() => dispatch(pivotedToFailingFlows(topic))}
        />
        <UsagePanel traffic={traffic} windowLabel="over the usage feed's own window" />
      </section>

      {flows.available && (
        <section>
          <h3>Flows</h3>
          <FlowList
            view={flows}
            failingOnly={failingOnly}
            subject={topic}
            onToggleFailing={() => dispatch(failingFlowsToggled())}
            onOpenService={openService}
          />
        </section>
      )}

      <section>
        <h3>Payload</h3>
        {entry.requestSchema && (<><h4>Request</h4><SchemaTree schema={entry.requestSchema} /></>)}
        {entry.responseSchema && (<><h4>Response</h4><SchemaTree schema={entry.responseSchema} /></>)}
        {entry.messageSchema && (<><h4>Message</h4><SchemaTree schema={entry.messageSchema} /></>)}
        {!entry.requestSchema && !entry.responseSchema && !entry.messageSchema && (
          <EmptyState message="No schema published for this topic." />
        )}
      </section>

      {entry.changes && entry.changes.length > 0 && (
        <section>
          <h3>Changes</h3>
          <ul>{entry.changes.map((c, i) => <li key={i}><Chip>{c.kind}</Chip> {c.description}</li>)}</ul>
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
