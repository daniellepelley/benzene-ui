import type { FeedHealth } from '../../store/selectors';

export interface FeedHealthLineProps {
  health: FeedHealth | null;
  /**
   * Whether a healthy feed is worth saying out loud.
   *
   * On the live surface it is — freshness is part of what that page reports. On the estate it is
   * not: a green line there is chrome, and chrome trains readers to skip the place a warning will
   * eventually appear. So the estate shows this line only when something is wrong.
   */
  showWhenHealthy?: boolean;
}

/**
 * The one line that tells a reader whether to believe the silence.
 *
 * Renders nothing when there is no live plane at all — that is the static floor, not a fault, and a
 * page with no collector should not carry a warning about one.
 */
export function FeedHealthLine({ health, showWhenHealthy = false }: FeedHealthLineProps) {
  if (!health) return null;
  if (health.kind === 'ok' && !showWhenHealthy) return null;

  return (
    <p
      className="bz-feed-health"
      data-kind={health.kind}
      role={health.kind === 'bad' ? 'alert' : undefined}
    >
      {health.text}
    </p>
  );
}
