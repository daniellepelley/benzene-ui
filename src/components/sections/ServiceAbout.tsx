import type { ServiceDescription, Liveness } from '../../store/selectors';
import { ValueRow } from '../controls/ValueRow';
import { EmptyState } from '../primitives/EmptyState';

export interface ServiceAboutProps {
  about: ServiceDescription | null;
  /**
   * The service's observed heartbeat, or null when there is no live plane.
   *
   * Shown here beside the pulled health check on purpose: these are two different health planes —
   * what the service says when asked, and whether it is still saying anything at all — and a reader
   * deciding whether to page someone needs both in one place.
   */
  liveness?: Liveness | null;
}

const LIVENESS_TEXT: Record<Liveness, string> = {
  live: 'Heartbeat healthy',
  stale: 'Heartbeat stale — the service has gone quiet',
  silent: 'Never heartbeated — the reporting middleware may not be wired',
};

/** What a service says about itself, from the spec the aggregator stored verbatim. */
export function ServiceAbout({ about, liveness = null }: ServiceAboutProps) {
  if (!about) return <EmptyState message="This service's snapshot has not been loaded." />;

  return (
    <div className="bz-about">
      {about.description && <p className="bz-about-desc">{about.description}</p>}
      {about.version && <ValueRow label="Service version">{about.version}</ValueRow>}
      {/* When we last *tried*, which is the useful reading even when the fetch failed — the failure
          itself belongs to the health panel, where it explains the missing checks. */}
      <ValueRow label="Snapshot taken" title="When the aggregator last fetched this service's spec">
        {about.fetchedAtUtc}
      </ValueRow>
      {about.drift && (
        <ValueRow
          label="Contract drift"
          title="The published spec changed between aggregator runs"
        >
          spec hash changed: {about.drift.previous} → {about.drift.current}
        </ValueRow>
      )}
      {liveness && (
        <ValueRow label="Live heartbeat" title="Observed, as opposed to self-reported">
          <span className="bz-about-live" data-liveness={liveness}>
            {LIVENESS_TEXT[liveness]}
          </span>
        </ValueRow>
      )}
    </div>
  );
}
