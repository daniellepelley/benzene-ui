import type { TopicsTopicsItem } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
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
          {/* A finding is a Badge, not a Chip. A schema mismatch is the reason to look at this row;
              a payload version is a fact about it, and the two must not look alike. */}
          {t.status && (
            <Badge rag={t.status === 'gap' ? 'amber' : 'red'} title={`Flagged: ${t.status}`}>
              {STATUS_LABEL[t.status] ?? t.status}
            </Badge>
          )}
          {t.schemaMismatch && (
            <Badge rag="red" title="Producer and consumer schemas disagree">schema mismatch</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
