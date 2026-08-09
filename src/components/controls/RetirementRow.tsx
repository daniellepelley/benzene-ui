import type { Rag } from '../../contracts';
import type { RetirementCandidate } from '../../store/selectors';
import { formatCount } from '../../store/selectors';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';

export interface RetirementRowProps {
  row: RetirementCandidate;
  rag: Rag;
  onOpen?: (topic: string) => void;
}

/**
 * One topic in the value view, with the evidence for its tier attached.
 *
 * The evidence is the point. A row that just said "retirement candidate" would be an assertion the
 * reader has to take on trust; a row that says *no declared consumers · no traffic observed while
 * the usage feed is wired* is a case they can act on, or refute.
 */
export function RetirementRow({ row, rag, onOpen }: RetirementRowProps) {
  const { entry, evidence, usageTotal } = row;
  const producers = (entry.producers ?? []).length;
  const consumers = (entry.consumers ?? []).length;

  return (
    <div className="bz-vd-row" data-rag={rag}>
      <StatusGlyph rag={rag} label={`tier: ${rag}`} />
      <button type="button" className="bz-vd-topic" onClick={() => onOpen?.(entry.topic)}>
        {entry.topic}
      </button>
      {entry.version && <Chip title="Payload schema version">{entry.version}</Chip>}
      <span className="bz-vd-shape">
        {producers} producer{producers === 1 ? '' : 's'} · {consumers} consumer{consumers === 1 ? '' : 's'}
      </span>
      {entry.status && <Chip title="Flagged by the aggregator">{entry.status}</Chip>}
      {(entry.changes ?? []).map((change, i) => (
        <Chip key={i} title={change.description}>
          {change.kind}
        </Chip>
      ))}
      {evidence.length > 0 && <span className="bz-vd-evidence">{evidence.join(' · ')}</span>}
      {usageTotal != null && usageTotal > 0 && (
        <span className="bz-vd-usage">{formatCount(usageTotal)} msgs observed</span>
      )}
    </div>
  );
}
