import type { TopicsTopicsItem } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { versionLabel } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';

export interface TopicListProps {
  topics: TopicsTopicsItem[];
  emptyMessage: string;
  onOpen?: (topic: string) => void;
}

/** Statuses the aggregator flags, spelled for humans — carried over from TOPIC_STATUS_LABELS. */
const STATUS_LABEL: Record<string, string> = {
  'deprecation-candidate': 'deprecation candidate',
  gap: 'gap',
};

export function TopicList({ topics, emptyMessage, onOpen }: TopicListProps) {
  if (topics.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <ul className="bz-topic-list">
      {topics.map((t) => (
        <li key={`${t.topic}@${t.version}`}>
          <button type="button" className="bz-topic-name" onClick={() => onOpen?.(t.topic)}>
            {t.topic}
          </button>
          {versionLabel(t.version) && <Chip title="Payload schema version">{versionLabel(t.version)}</Chip>}
          {t.reserved && <Chip title="A topic Benzene itself owns">reserved</Chip>}
          {t.status && <Chip title={`Flagged: ${t.status}`}>{STATUS_LABEL[t.status] ?? t.status}</Chip>}
          {t.schemaMismatch && <Chip title="Producer and consumer schemas disagree">schema mismatch</Chip>}
        </li>
      ))}
    </ul>
  );
}
