import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectIssueSummary, selectFleetAvailable, selectInboxIssues } from '../../store/selectors';
import { navigated } from '../../store/slices/viewSlice';
import { IssueRow, issueHeadline } from '../controls/IssueRow';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';

export interface IssuePageProps {
  /** An issue fingerprint, or 'all' for the inbox. */
  selected: string;
}

export function IssuePage({ selected }: IssuePageProps) {
  const dispatch = useAppDispatch();
  const available = useAppSelector(selectFleetAvailable);
  const issues = useAppSelector(selectInboxIssues);
  const summary = useAppSelector(selectIssueSummary);

  if (!available) {
    // No collector is not an empty inbox — saying "no issues" would be a lie of omission.
    return <EmptyState message="No collector is wired, so no issues have been observed. This is not the same as there being none." />;
  }

  if (selected !== 'all') {
    const issue = issues.find((i) => i.fingerprint === selected);
    if (!issue) return <EmptyState message="That issue is no longer in the observation window." />;
    return (
      <div className="bz-page">
        <header className="bz-page-head"><h2>{issueHeadline(issue)}</h2><Chip>{issue.classification}</Chip></header>
        <IssueRow issue={issue} />
        <p className="bz-issue-seen">
          {/* First and last seen, not "when it happened": this is a merged signature, and how long
              it has been recurring is what decides whether it is a regression or background noise. */}
          first seen {issue.firstSeen} · last seen {issue.lastSeen}
        </p>
        {issue.exemplarTraceIds.length > 0 && (
          <p className="bz-issue-exemplars">
            {/* The bridge from "what is wrong" to "what happened" — the newest traces that showed it. */}
            exemplar traces: {issue.exemplarTraceIds.join(', ')}
          </p>
        )}
        <p>
          <button type="button" onClick={() => dispatch(navigated({ page: 'service', selected: issue.service }))}>
            {issue.service}
          </button>
          {issue.topic && (
            <button type="button" onClick={() => dispatch(navigated({ page: 'topic', selected: issue.topic! }))}>
              {issue.topic}
            </button>
          )}
        </p>
      </div>
    );
  }

  if (issues.length === 0) return <EmptyState message="No issues observed in the last 24 hours." />;

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Issues</h2>
        <Chip title="Occurrences, not distinct issues">
          {summary.occurrences.toLocaleString()} occurrences · {summary.distinct} distinct
        </Chip>
        {/* The window is stated, because it is deliberately NOT the one the picker controls. */}
        <span className="bz-page-note">last 24 hours</span>
      </header>
      {issues.map((i) => (
        <IssueRow
          key={i.fingerprint}
          issue={i}
          onOpen={(fingerprint) => dispatch(navigated({ page: 'issue', selected: fingerprint }))}
        />
      ))}
    </div>
  );
}
