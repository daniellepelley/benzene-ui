import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectIssueSummary, selectFleetAvailable } from '../../store/selectors';
import { navigated } from '../../store/slices/viewSlice';
import { IssueRow } from '../controls/IssueRow';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';
import type { RootState } from '../../store/store';

export interface IssuePageProps {
  /** An issue id, or 'all' for the inbox. */
  selected: string;
}

export function IssuePage({ selected }: IssuePageProps) {
  const dispatch = useAppDispatch();
  const available = useAppSelector(selectFleetAvailable);
  const issues = useAppSelector((s: RootState) => s.fleet.issues);
  const summary = useAppSelector(selectIssueSummary);

  if (!available) {
    // No collector is not an empty inbox — saying "no issues" would be a lie of omission.
    return <EmptyState message="No collector is wired, so no issues have been observed. This is not the same as there being none." />;
  }

  if (selected !== 'all') {
    const issue = issues.find((i) => i.id === selected);
    if (!issue) return <EmptyState message="That issue is no longer in the observation window." />;
    return (
      <div className="bz-page">
        <header className="bz-page-head"><h2>Issue</h2><Chip>{issue.classification}</Chip></header>
        <IssueRow issue={issue} />
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

  if (issues.length === 0) return <EmptyState message="No issues observed in this window." />;

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Issues</h2>
        <Chip title="Occurrences, not distinct issues">
          {summary.occurrences.toLocaleString()} occurrences · {summary.distinct} distinct
        </Chip>
      </header>
      {issues.map((i) => (
        <IssueRow key={i.id} issue={i} onOpen={(id) => dispatch(navigated({ page: 'issue', selected: id }))} />
      ))}
    </div>
  );
}
