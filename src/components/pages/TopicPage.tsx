import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopic, selectTrafficForTopic, selectThread, selectCanPost,
} from '../../store/selectors';
import { navigated } from '../../store/slices/viewSlice';
import { draftChanged, draftAuthorChanged, postAnnotation } from '../../store/slices/annotationsSlice';
import { SchemaTree } from '../sections/SchemaTree';
import { UsagePanel } from '../controls/UsagePanel';
import { Thread } from '../sections/Thread';
import { Composer } from '../sections/Composer';
import { ValueRow } from '../controls/ValueRow';
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

  if (!entry) return <EmptyState message={`${topic} is not in the published catalog.`} />;

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>{entry.topic}</h2>
        {entry.version && <Chip title="Payload schema version">v{entry.version}</Chip>}
        {entry.reserved && <Chip>reserved</Chip>}
        {entry.status && <Chip title="Flagged by the aggregator">{entry.status}</Chip>}
      </header>

      <section>
        <ValueRow label="Consumers">
          {entry.consumers.length === 0
            ? 'none'
            : entry.consumers.map((c) => (
                <button key={c.service} type="button" onClick={() => openService(c.service)}>
                  {c.service}
                </button>
              ))}
        </ValueRow>
        <ValueRow label="Producers">
          {entry.producers.length === 0
            ? 'none'
            : entry.producers.map((p) => (
                <button key={p.service} type="button" onClick={() => openService(p.service)}>
                  {p.service}
                </button>
              ))}
        </ValueRow>
        {entry.schemaMismatch && (
          <ValueRow label="Schema" title="Producer and consumer disagree on the payload shape">
            <Chip>mismatch</Chip>
          </ValueRow>
        )}
      </section>

      <section><h3>Traffic</h3><UsagePanel traffic={traffic} /></section>

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
          onPost={() =>
            void dispatch(postAnnotation({ entity, author: annotations.draftAuthor, text: annotations.draft }))
          }
        />
      </section>
    </div>
  );
}
