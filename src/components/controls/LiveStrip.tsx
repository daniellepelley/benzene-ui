import type { Liveness } from '../../store/selectors';
import { Chip } from '../primitives/Chip';

export interface LiveStripProps {
  liveness: Liveness;
  /** Occurrences in the window, not distinct issues. */
  issueCount: number;
  /** True when the service says healthy but has stopped reporting. */
  diverged: boolean;
}

const DOT: Record<Liveness, string> = { live: '●', stale: '◐', silent: '○' };
const TITLE: Record<Liveness, string> = {
  live: 'Heartbeat received recently',
  stale: 'No heartbeat for longer than the staleness window',
  silent: 'Never reported — this service may not have mesh reporting wired',
};

/**
 * The observed plane for one service, beside its declared status.
 *
 * `silent` is rendered differently from `stale` on purpose: a service that has never reported is
 * probably missing the reporting middleware, not failing, and accusing it of being down is how an
 * honest dashboard loses trust.
 */
export function LiveStrip({ liveness, issueCount, diverged }: LiveStripProps) {
  return (
    <span
      className="bz-live"
    >
      <span title={TITLE[liveness]} aria-label={TITLE[liveness]} role="img" data-liveness={liveness}>
        {DOT[liveness]}
      </span>
      {issueCount > 0 && <Chip title={`${issueCount} occurrences in this window`}>{issueCount}</Chip>}
      {diverged && (
        <Chip title="Declared healthy, but has stopped reporting">declared healthy, silent</Chip>
      )}
    </span>
  );
}
