import type { TopicsTopicsItem } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
import { versionLabel } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';

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
            <Badge rag="red">schema mismatch</Badge>
          )}
          {/* A CHIP HERE, NOT A SEVERITY BADGE — and the distinction is the whole point.
              This list is always one service's own topics, and it only ever contains versions that
              service DECLARES. An entry carrying a comparison is therefore the newer half of a pair
              that this service is already on: it has done the work. A red badge here marks the
              mover, which is exactly the defect the rollout surfaces were built to remove, sitting
              four inches away from the block that now removes it and contradicting it.

              The verdict is still worth stating — it is a real fact about the version pair — so it
              keeps its words and its subject and loses its alarm.

              `notCompared` stays absent: on a dense list it would read as a warning about the topic
              rather than a statement about the comparison, and the topic page states it properly. */}
          {t.compatibility && t.compatibility.overall !== 'notCompared'
            && t.compatibility.changes.length > 0 && (
              <Chip title={`This service declares ${versionLabel(t.version) || 'this version'}, so it has already made this move. `
                + `The verdict describes the change from ${t.compatibility.baselineVersion ?? 'the previous version'}, `
                + 'for a reader still on it.'}>
                {t.compatibility.baselineVersion
                  ? `${t.compatibility.baselineVersion} → ${versionLabel(t.version)}`
                  : 'changed'}
                {' · '}
                {t.compatibility.overall}
              </Chip>
            )}
        </li>
      ))}
    </ul>
  );
}
