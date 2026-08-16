import type { TopicLive, TopicTraffic } from '../../store/selectors';
import { formatCount } from '../../store/selectors';
import { Chip } from '../primitives/Chip';

export interface TopicLiveStripProps {
  live: TopicLive;
  /** The usage feed's figure for the same topic, over the feed's own window. */
  traffic: TopicTraffic;
  /** Drills the error count into the flows behind it. Without it the count is a dead end. */
  onShowFailingFlows?: () => void;
}

/**
 * The two traffic planes for one topic, side by side, each carrying its own window.
 *
 * This is the tally rule made structural. The live plane counts over the window the reader picked;
 * the usage feed counts over whatever window its adapters baked in, which cannot be re-windowed
 * client-side. Summing them, or letting the picked window's label sit next to the feed's number,
 * produces a figure that looks authoritative and is wrong — so each number states its own provenance
 * inline, and they are never combined.
 *
 * Live silence is reported as silence *in that window*, not as zero traffic: a topic with no live
 * rows in fifteen minutes and thousands of messages in the usage feed is a quiet topic, not a dead one.
 */
export function TopicLiveStrip({ live, traffic, onShowFailingFlows }: TopicLiveStripProps) {
  if (!live.available) return null;

  return (
    <div className="bz-live-strip">
      <span className="bz-live-tag">live</span>

      {live.observed == null ? (
        <>
          {traffic.observed && (
            <span className="bz-live-item">
              <span className="bz-live-k">observed</span>
              <span className="bz-live-v">{formatCount(traffic.total)}</span>
              <span className="bz-live-window">usage feed, its own window</span>
            </span>
          )}
          <span className="bz-live-silent">
            {traffic.observed
              ? `no live traffic in the last ${live.rangeLabel}`
              : `not observed in the live mesh in the last ${live.rangeLabel}`}
          </span>
        </>
      ) : (
        <>
          <span className="bz-live-item">
            <span className="bz-live-k">observed</span>
            <span className="bz-live-v">{formatCount(live.observed)}</span>
            {/* The counts do not always answer the picked window. When they do not, they say so here
                rather than borrowing the window's label — see TopicLive.countsSince. */}
            <span className="bz-live-window">
              {live.countsSince ? `counts cover from ${live.countsSince}` : `last ${live.rangeLabel}`}
            </span>
          </span>
          <span className="bz-live-item" data-failing={live.errors > 0 ? 'true' : undefined}>
            <span className="bz-live-k">errors</span>
            {live.errors > 0 && onShowFailingFlows ? (
              <button type="button" className="bz-live-pivot" onClick={onShowFailingFlows}
                title="Show this topic's failing flows">
                {formatCount(live.errors)} ↗
              </button>
            ) : (
              <span className="bz-live-v">{formatCount(live.errors)}</span>
            )}
          </span>
          <span className="bz-live-item">
            <span className="bz-live-k">avg ms</span>
            {/* An em-dash, never 0: the contract's non-nullable default is not a measurement. */}
            <span className="bz-live-v">
              {live.avgDurationMs == null ? '—' : live.avgDurationMs.toFixed(1)}
            </span>
          </span>
          {live.registeredHandlers.length > 0 && (
            <span className="bz-live-item">
              <span className="bz-live-k">registered handlers</span>
              {live.registeredHandlers.map((s) => (
                <Chip key={s} title="Registered to handle this topic. Registration is not traffic — see the count beside it.">
                  {s}
                </Chip>
              ))}
            </span>
          )}
          {Object.keys(live.statusCounts).length > 0 && (
            <span className="bz-live-item">
              <span className="bz-live-k">by status</span>
              {Object.entries(live.statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <Chip key={status} title={`${count.toLocaleString()} observed`}>
                    {status} {formatCount(count)}
                  </Chip>
                ))}
            </span>
          )}
          {live.missingFeeds.length > 0 && (
            // Reduced is visible, never mistaken for empty: the plane names what it could not supply.
            <span className="bz-live-missing">
              not supplied by this plane: {live.missingFeeds.join(', ')}
            </span>
          )}
        </>
      )}
    </div>
  );
}
