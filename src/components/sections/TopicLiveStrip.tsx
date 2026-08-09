import type { TopicLive, TopicTraffic } from '../../store/selectors';
import { formatCount } from '../../store/selectors';
import { Chip } from '../primitives/Chip';

export interface TopicLiveStripProps {
  live: TopicLive;
  /** The usage feed's figure for the same topic, over the feed's own window. */
  traffic: TopicTraffic;
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
export function TopicLiveStrip({ live, traffic }: TopicLiveStripProps) {
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
            <span className="bz-live-window">last {live.rangeLabel}</span>
          </span>
          <span className="bz-live-item" data-failing={live.errors > 0 ? 'true' : undefined}>
            <span className="bz-live-k">errors</span>
            <span className="bz-live-v">{formatCount(live.errors)}</span>
          </span>
          {live.services.length > 0 && (
            <span className="bz-live-item">
              <span className="bz-live-k">observed handlers</span>
              {live.services.map((s) => (
                <Chip key={s} title="Seen handling this topic — observed, not declared">
                  {s}
                </Chip>
              ))}
            </span>
          )}
        </>
      )}
    </div>
  );
}
