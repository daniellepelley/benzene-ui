import type { TopicsTopicsItem } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
import { versionLabel } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { VerdictBadge } from '../sections/ContractChanges';

export interface TopicListProps {
  topics: TopicsTopicsItem[];
  emptyMessage: string;
  onOpen?: (topic: string, version: string) => void;
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
          {/* The version is INSIDE the button, not a chip beside it. A versioned catalogue renders
              one row per version, so with the label outside, two rows for the same topic were
              indistinguishable to anything reading the page by name — a screen reader, a test, or a
              reader scanning — and both opened the same page. The version is part of the identity of
              the thing being opened, so it belongs in the thing you click. */}
          <button
            type="button"
            className="bz-topic-name"
            onClick={() => onOpen?.(t.topic, t.version)}
          >
            {t.topic}
            {versionLabel(t.version) && (
              <span className="bz-topic-version" title="Payload schema version">
                {versionLabel(t.version)}
              </span>
            )}
          </button>
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
          {/* Only ever shown for a verdict that was actually earned. `notCompared` is deliberately
              absent here: on a dense list it would read as a warning about the topic rather than a
              statement about the comparison, and the topic page states it properly. */}
          {t.compatibility && t.compatibility.overall !== 'notCompared'
            && t.compatibility.changes.length > 0 && (
              <VerdictBadge verdict={t.compatibility.overall} attribute={false} />
            )}
        </li>
      ))}
    </ul>
  );
}
