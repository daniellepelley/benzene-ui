import type { FlowView } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';

export interface FlowListProps {
  view: FlowView;
  failingOnly: boolean;
  onToggleFailing?: () => void;
  onOpenService?: (service: string) => void;
  /** What these flows are about, for the empty state's wording. */
  subject?: string;
}

/**
 * Recent flows — the evidence plane.
 *
 * Issues answer *what is wrong*; a flow answers *what happened*, and the path between them is what
 * makes an error count worth showing. A count with no way through to an example is a dead end, and
 * dead ends teach readers to stop looking.
 *
 * The empty case is three different statements, and they must not be merged: no collector at all,
 * a plane that returned no flows despite reporting traffic (they are sampled and capped, and a
 * counts-only poll asks for none), and a genuine absence.
 */
export function FlowList({ view, failingOnly, onToggleFailing, onOpenService, subject }: FlowListProps) {
  if (!view.available) return null;

  const about = subject ? ` for ${subject}` : '';

  const toggle = onToggleFailing && view.total > 0 && (
    <button type="button" className="bz-flow-toggle" onClick={onToggleFailing}>
      {failingOnly
        ? `showing ${view.flows.length} failing of ${view.total}`
        : `${view.failing} failing of ${view.total}`}
    </button>
  );

  if (view.flows.length === 0) {
    return (
      <>
        {view.sampledOut ? (
          <EmptyState
            message={`Traffic was observed${about}, but this plane returned no flows to show. Flows are sampled and capped, so this is not evidence that nothing happened.`}
          />
        ) : (
          <EmptyState
            message={
              failingOnly
                ? `No failing flows${about} in this window.`
                : `No flows observed${about} in this window.`
            }
          />
        )}
        {failingOnly && toggle}
      </>
    );
  }

  return (
    <div className="bz-flows">
      {toggle}
      <ul className="bz-flow-list">
        {view.flows.map((flow) => (
          <li key={flow.traceId} data-failed={flow.failed || undefined}>
            <StatusGlyph rag={flow.failed ? 'red' : 'green'} label={flow.failed ? 'failed' : 'succeeded'} />
            {/* The trace id is the handle for whatever tracing backend the estate actually runs —
                we do not know its URL, so it is presented to copy rather than linked into a guess. */}
            <code className="bz-flow-id" title="Trace id">
              {flow.traceId}
            </code>
            {flow.topic && <Chip title="Entry topic">{flow.topic}</Chip>}
            <span className="bz-flow-meta">{flow.durationMs.toFixed(0)}ms</span>
            <span className="bz-flow-meta">{flow.events} events</span>
            <span className="bz-flow-services">
              {flow.services.map((s) => (
                <button key={s} type="button" className="bz-flow-svc" onClick={() => onOpenService?.(s)}>
                  {s}
                </button>
              ))}
            </span>
            <time className="bz-flow-meta" dateTime={flow.startedAt}>
              {flow.startedAt}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}
