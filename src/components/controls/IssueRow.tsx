import type { LiveIssue } from '../../store/slices/fleetSlice';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';

export interface IssueRowProps {
  issue: LiveIssue;
  onOpen?: (id: string) => void;
}

/** Classification drives the colour: a mis-wiring is not the same severity as one bad payload. */
const RAG_FOR = {
  exception: 'red',
  'config-wiring': 'red',
  dependency: 'amber',
  'contract-drift': 'amber',
  validation: 'green',
  unclassified: 'gone',
} as const;

export function IssueRow({ issue, onOpen }: IssueRowProps) {
  return (
    <div className="bz-issue" data-classification={issue.classification}>
      <Badge rag={RAG_FOR[issue.classification]}>{issue.classification}</Badge>
      <button type="button" className="bz-issue-msg" onClick={() => onOpen?.(issue.id)}>
        {issue.message}
      </button>
      <span className="bz-issue-meta">
        {issue.topic && <Chip title="Topic">{issue.topic}</Chip>}
        {/* Occurrences, not distinct issues — 400 of one thing outranks four of four things. */}
        <Chip title={`${issue.count} occurrences`}>×{issue.count}</Chip>
      </span>
    </div>
  );
}
