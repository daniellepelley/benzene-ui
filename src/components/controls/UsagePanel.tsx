import type { ReactNode } from 'react';
import type { TopicTraffic } from '../../store/selectors';
import type { UsageEntriesItem } from '../../contracts';
import { UsageBreakdown } from './UsageBreakdown';
import { EmptyState } from '../primitives/EmptyState';

export interface UsagePanelProps {
  traffic: TopicTraffic;
  /**
   * The rows behind the totals, for the per-transport breakdown.
   *
   * "Over which transports" is half of what the mesh promises about traffic, and this surface — the
   * one page about a single topic — was the one that never answered it.
   */
  entries?: UsageEntriesItem[];
  /**
   * What period these counts cover.
   *
   * A node, not a string, because the honest form of this phrase is a pair of dates that carry their
   * ages — and a usage window that ended five weeks ago is the single fact that decides whether the
   * number beside it can be quoted.
   */
  windowLabel?: ReactNode;
  /**
   * The version the surrounding page is showing, when there is one. Used only to state honestly that
   * the figure is NOT scoped to it when the feed cannot attribute by version.
   */
  version?: string | null;
}

/**
 * Success/failure split for a topic.
 *
 * `observed: false` is rendered as "no usage source wired", never as zero. Zero traffic on a topic
 * that IS being measured is a real finding — a deprecation candidate. Zero because nothing is
 * measuring is not a finding at all, and showing them identically is how a dashboard invents work.
 */
export function UsagePanel({ traffic, entries = [], windowLabel, version = null }: UsagePanelProps) {
  if (!traffic.observed) {
    return <EmptyState message="No usage source is wired, so traffic for this topic is unknown." tone="unknown" />;
  }

  // Wired, and it reported nothing for this topic. That is a measurement, not an absence of one, and
  // it is the difference between "we cannot tell" and "nobody has called this" — which is the whole
  // basis of a retirement argument.
  if (!traffic.rowsForTopic) {
    return (
      <EmptyState
        message="The usage feed is wired and reported no traffic for this topic."
        tone="clear"
      />
    );
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
        <strong>{traffic.total.toLocaleString()}</strong> calls{windowLabel ? <> {windowLabel}</> : null} ·{' '}
        {traffic.failure.toLocaleString()} failed ({(failureRate * 100).toFixed(1)}%)
      </p>
      {/* The feed carries no version on its rows, so this total covers the whole topic. Printing it
          unqualified under a version heading tells a reader that version is carrying traffic it may
          not be carrying at all — and on a page that can simultaneously say nothing consumes it. */}
      {/* A failure count that is partly a guess must say so. The spec lets a receiver with no
          `isSuccessful` signal treat an application-defined status as a failure, and the usage feed
          carries no such signal — but permission to assume the worst is not permission to render the
          assumption as a measurement, least of all on a screen someone deploys from. */}
      {traffic.unrecognised > 0 && (
        <p className="bz-usage-note">
          {traffic.unrecognised.toLocaleString()} of these are in statuses this build does not
          recognise. They are counted as failures because there is no signal to trust them with —
          they may not be failures.
        </p>
      )}
      {!traffic.versionAttributed && version && (
        <p className="bz-usage-note">
          This is the whole topic&rsquo;s traffic. The usage feed does not break it down by version,
          so none of it is attributed to {version}.
        </p>
      )}
      {traffic.total === 0 && (
        <p className="bz-usage-note">
          Measured, but no traffic in this window — a deprecation candidate rather than a gap in the feed.
        </p>
      )}
      {/* OVER WHICH TRANSPORTS — the other half of what the mesh promises about traffic, and the
          half this surface never delivered. Only the transport dimension: the topic is the page's
          subject, and the success/failure split above already reports status. */}
      {entries.length > 0 && (
        <UsageBreakdown entries={entries} dimensions={[{ key: 'transport', label: 'Transport' }]} />
      )}
    </div>
  );
}
