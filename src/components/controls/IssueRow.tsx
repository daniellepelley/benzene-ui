import type { MeshIssue, IssueClassification, Rag } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';

export interface IssueRowProps {
  issue: MeshIssue;
  onOpen?: (fingerprint: string) => void;
}

/** Classification drives the colour: a mis-wiring is not the same severity as one bad payload. */
const RAG_FOR: Record<IssueClassification, Rag> = {
  exception: 'red',
  'config-wiring': 'red',
  dependency: 'amber',
  'contract-drift': 'amber',
  validation: 'green',
  unclassified: 'gone',
};

/**
 * The headline for one issue.
 *
 * There is no `message` on the wire, by design: a message is prose that varies per occurrence, and
 * fingerprinting on it would shatter one recurring failure into thousands of singletons. So the
 * headline is composed from the stable parts — the exception type where the emitter had one, the
 * Benzene status otherwise — and the reader gets a name they can search for rather than a sentence.
 */
export function issueHeadline(issue: MeshIssue): string {
  const what = issue.exceptionType ?? issue.status;
  return `${what} on ${issue.topic}`;
}

export function IssueRow({ issue, onOpen }: IssueRowProps) {
  return (
    <div className="bz-issue" data-classification={issue.classification}>
      <Badge rag={RAG_FOR[issue.classification]}>{issue.classification}</Badge>
      <button type="button" className="bz-issue-msg" onClick={() => onOpen?.(issue.fingerprint)}>
        {issueHeadline(issue)}
      </button>
      <span className="bz-issue-meta">
        <Chip title="Service reporting the failure">{issue.service}</Chip>
        {issue.version && <Chip title="Payload version">{issue.version}</Chip>}
        {/* Occurrences, not distinct issues — 400 of one thing outranks four of four things. */}
        <Chip title={`${issue.count} occurrences`}>×{issue.count}</Chip>
        {issue.resolutionHint && (
          <Chip title="A key into the remediation catalog — never prose">{issue.resolutionHint}</Chip>
        )}
      </span>
    </div>
  );
}
