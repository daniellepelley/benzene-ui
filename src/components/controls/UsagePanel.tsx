import type { TopicTraffic } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';

export interface UsagePanelProps {
  traffic: TopicTraffic;
  windowLabel?: string;
}

/**
 * Success/failure split for a topic.
 *
 * `observed: false` is rendered as "no usage source wired", never as zero. Zero traffic on a topic
 * that IS being measured is a real finding — a deprecation candidate. Zero because nothing is
 * measuring is not a finding at all, and showing them identically is how a dashboard invents work.
 */
export function UsagePanel({ traffic, windowLabel }: UsagePanelProps) {
  if (!traffic.observed) {
    return <EmptyState message="No usage source is wired, so traffic for this topic is unknown." />;
  }

  const failureRate = traffic.total > 0 ? traffic.failure / traffic.total : 0;
  const pct = (n: number) => (traffic.total > 0 ? Math.round((n / traffic.total) * 100) : 0);

  return (
    <div className="bz-usage">
      <div className="bz-usage-bar" role="img" aria-label={`${pct(traffic.success)}% success`}>
        <span className="bz-usage-ok" style={{ width: `${pct(traffic.success)}%` }} />
        <span className="bz-usage-fail" style={{ width: `${pct(traffic.failure)}%` }} />
      </div>
      <p className="bz-usage-legend">
        <strong>{traffic.total.toLocaleString()}</strong> calls{windowLabel ? ` ${windowLabel}` : ''} ·{' '}
        {traffic.failure.toLocaleString()} failed ({(failureRate * 100).toFixed(1)}%)
      </p>
      {traffic.total === 0 && (
        <p className="bz-usage-note">
          Measured, but no traffic in this window — a deprecation candidate rather than a gap in the feed.
        </p>
      )}
    </div>
  );
}
