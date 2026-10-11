import type { SpecSummaryModel } from '../../store/selectors';
import { Chip } from '../primitives/Chip';

export interface SpecSummaryProps {
  summary: SpecSummaryModel | null;
}

/**
 * The service in five numbers, plus how to reach it.
 *
 * Its own topics only — Benzene's `benzene:` utilities are never part of a Contract Document's
 * lists, and the reader drops them from a legacy document that listed them. `messageEndpoint` is the one
 * that changes what a reader can do rather than what they know: it is how the mesh UI's composer
 * feature-detects whether this service can be sent a message at all.
 */
export function SpecSummary({ summary }: SpecSummaryProps) {
  if (!summary) return null;

  const stats = [
    { key: 'topics', value: summary.topics, label: summary.topics === 1 ? 'Topic' : 'Topics', accent: true },
    { key: 'http', value: summary.httpMapped, label: 'HTTP-mapped' },
    { key: 'events', value: summary.events, label: summary.events === 1 ? 'Event' : 'Events' },
    { key: 'sends', value: summary.sends, label: summary.sends === 1 ? 'Send' : 'Sends' },
    { key: 'schemas', value: summary.schemas, label: 'Schemas' },
  ];

  return (
    <div className="bz-spec-summary">
      <div className="bz-stats">
        {stats.map((s) => (
          <div className="bz-stat" key={s.key} data-accent={s.accent || undefined}>
            <span className="bz-stat-n">{s.value}</span>
            <span className="bz-stat-l">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="bz-spec-reach">
        {summary.transports.length > 0 && (
          <span className="bz-spec-reach-row">
            <span className="bz-spec-reach-k">Transports</span>
            {summary.transports.map((t) => (
              <Chip key={t} title="This host receives messages over this transport">
                {t}
              </Chip>
            ))}
          </span>
        )}
        {summary.messageEndpoint && (
          <span className="bz-spec-reach-row">
            <span className="bz-spec-reach-k">Message endpoint</span>
            <code>{summary.messageEndpoint}</code>
          </span>
        )}
        {summary.contractHash && (
          // The served hash a generated client's embedded one is compared against (§6.1). In full,
          // not shortened behind a hover: it is what gets pasted into a drift report.
          <span className="bz-spec-reach-row">
            <span className="bz-spec-reach-k">Contract hash</span>
            <code className="bz-spec-hash">{summary.contractHash}</code>
          </span>
        )}
      </div>
    </div>
  );
}
