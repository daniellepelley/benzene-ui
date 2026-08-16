import type { ServiceLive } from '../../store/selectors';
import { formatCount } from '../../store/selectors';
import { Stamp } from '../primitives/Stamp';

export interface ServiceLiveStripProps {
  live: ServiceLive;
  /** The ticked clock, for `countsSince`. */
  now: number;
}

/**
 * The live plane's traffic for one service, above the usage feed's.
 *
 * The Traffic card read `usage.json` and nothing else, so a service the collector was actively
 * watching could render "the usage feed observed nothing handled by this service" while the live
 * plane, two selectors away, was reporting thousands of invocations. Two planes disagreeing is not a
 * bug — they count different things over different windows — but only ONE of them being on screen is.
 *
 * The tally rule, as on the topic page: each number carries its own provenance and window, and they
 * are never summed. The topic surface has had both planes side by side since C1; this one never got
 * them, which is the same unjoined-capability defect the last four rounds kept finding.
 */
export function ServiceLiveStrip({ live, now }: ServiceLiveStripProps) {
  if (!live.available) return null;

  return (
    <div className="bz-live-strip">
      <span className="bz-live-tag">live</span>

      {live.observed == null ? (
        // No row, or a plane that declared it has no usage feed for this service. Neither is zero
        // traffic: one is "the collector does not know this service", the other "it declined to say".
        <span className="bz-live-silent">
          {live.missingFeeds.length > 0
            ? `this plane does not supply ${live.missingFeeds.join(', ')} for this service`
            : `the live plane has no row for this service in the last ${live.rangeLabel}`}
        </span>
      ) : (
        <>
          <span className="bz-live-item">
            <span className="bz-live-k">observed</span>
            <span className="bz-live-v">{formatCount(live.observed)}</span>
            <span className="bz-live-window">
              {live.countsSince
                ? <>counts cover from <Stamp iso={live.countsSince} now={now} /></>
                : `last ${live.rangeLabel}`}
            </span>
          </span>
          <span className="bz-live-item" data-failing={(live.errors ?? 0) > 0 ? 'true' : undefined}>
            <span className="bz-live-k">errors</span>
            <span className="bz-live-v">{formatCount(live.errors ?? 0)}</span>
          </span>
          {live.missingFeeds.length > 0 && (
            <span className="bz-live-missing">
              not supplied by this plane: {live.missingFeeds.join(', ')}
            </span>
          )}
        </>
      )}
    </div>
  );
}
