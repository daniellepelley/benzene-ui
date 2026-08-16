import type { RefreshState } from '../../store/slices/estateSlice';

export interface RefreshButtonProps {
  /** False when no refresh endpoint is configured. Renders nothing — see below. */
  available: boolean;
  state: RefreshState;
  /** What to say about the last attempt: the rate limit, an expired session, or a real failure. */
  note?: string | null;
  onRefresh: () => void;
  /** The header says "Refresh"; the first-run empty state asks for something more explicit. */
  label?: string;
}

/**
 * How a refused refresh reads. Only two tones, because only two things are true of one: either the
 * mesh declined for a reason that is working as designed, or something is wrong.
 */
const TONE: Record<RefreshState, 'quiet' | 'bad' | null> = {
  idle: null,
  refreshing: null,
  // Rate-limited. The refresh did not happen and nothing is broken; "try again shortly" is the whole
  // story, and dressing it in red would teach the reader to distrust red.
  throttled: 'quiet',
  expired: 'bad',
  failed: 'bad',
};

/**
 * Asks the mesh to run a discovery pass now.
 *
 * Absent, not disabled, when the deployment has no refresh endpoint: a control that cannot work is a
 * claim about the mesh that is not true.
 *
 * Disabled while a pass is in flight — the server rate-limits refreshes anyway, but letting a reader
 * queue ten with ten clicks and then meet a wall of "refreshed recently" is the client being rude
 * first and blaming the server for it.
 */
export function RefreshButton({ available, state, note, onRefresh, label = 'Refresh' }: RefreshButtonProps) {
  if (!available) return null;

  const busy = state === 'refreshing';
  const tone = TONE[state];

  return (
    <span className="bz-refresh">
      <button
        type="button"
        className="bz-refresh-go"
        onClick={onRefresh}
        disabled={busy}
        aria-busy={busy || undefined}
        title="Ask the mesh to run a discovery pass now"
      >
        {busy ? 'Refreshing…' : label}
      </button>
      {tone && note && (
        <span className="bz-refresh-note" data-tone={tone} role="status">
          {note}
        </span>
      )}
    </span>
  );
}
