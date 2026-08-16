import type { MeshIssue, IssueClassification, Rag } from '../../contracts';
import { Chip } from '../primitives/Chip';

export interface IssueRowProps {
  issue: MeshIssue;
  onOpen?: (fingerprint: string) => void;
}

/**
 * Severity and classification are two axes, and merging them was wrong.
 *
 * The previous version gave each classification a RAG badge, which painted a failing payload
 * *green* — green means healthy everywhere else in this product, so a green badge on an issue is
 * wrong on its face. Severity now drives the visual weight, as a dot; classification is a neutral
 * label that says what kind of thing it is without claiming how bad it is.
 */
const SEVERITY: Record<IssueClassification, Rag> = {
  exception: 'red',
  'config-wiring': 'red',
  dependency: 'amber',
  'contract-drift': 'amber',
  validation: 'gone',
  unclassified: 'gone',
};

/**
 * What this class of failure usually means, in a sentence.
 *
 * `config-wiring on orders:create` tells a developer something and a business analyst nothing. The
 * wire deliberately carries no prose — a per-occurrence message would shatter one recurring failure
 * into thousands of fingerprints — so the sentence has to come from the classification, which is a
 * closed vocabulary and therefore safe to explain.
 */
export const WHY: Record<IssueClassification, string> = {
  exception: 'The handler threw. The service has a bug, or is meeting input it does not expect.',
  'config-wiring': 'Nothing is registered to handle this. Usually a missing or misnamed registration.',
  dependency: 'Something this service calls is failing. The fault is likely downstream, not here.',
  'contract-drift': 'The payload no longer matches what the handler expects — a producer changed shape.',
  validation: 'Callers are sending payloads the contract rejects. Usually the caller, not this service.',
  unclassified: 'The emitter could not classify this failure.',
};

/**
 * The headline for one issue.
 *
 * Composed from the stable parts — the exception type where the emitter had one, the Benzene status
 * otherwise — so the reader gets a name they can search for rather than a sentence that varies.
 */
export function issueHeadline(issue: MeshIssue): string {
  const what = issue.exceptionType ?? issue.status;
  return `${what} on ${issue.topic}`;
}

export function IssueRow({ issue, onOpen }: IssueRowProps) {
  const severity = SEVERITY[issue.classification];

  return (
    <button
      type="button"
      className="bz-issue"
      data-classification={issue.classification}
      data-severity={severity}
      onClick={() => onOpen?.(issue.fingerprint)}
    >
      <span className="bz-issue-dot" role="img" aria-label={`severity: ${severity}`} />
      <span className="bz-issue-main">
        <span className="bz-issue-headline">{issueHeadline(issue)}</span>
        <span className="bz-issue-why">{WHY[issue.classification]}</span>
      </span>
      <span className="bz-issue-meta">
        <Chip>{issue.classification}</Chip>
        <Chip tone="accent">{issue.service}</Chip>
        {issue.version && <Chip>{issue.version}</Chip>}
        {/* Occurrences, not distinct issues — 400 of one thing outranks four of four things. */}
        <Chip tone="count" title={`${issue.count} occurrences`}>
          ×{issue.count.toLocaleString()}
        </Chip>
        {issue.resolutionHint && (
          <Chip tone="warn" title="A key into the remediation catalog — never prose">
            {issue.resolutionHint}
          </Chip>
        )}
      </span>
      <span className="bz-issue-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
