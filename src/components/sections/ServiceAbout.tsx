import type { ServiceDescription, Liveness } from '../../store/selectors';
import { ValueRow } from '../controls/ValueRow';
import { EmptyState } from '../primitives/EmptyState';

export interface ServiceAboutProps {
  about: ServiceDescription | null;
}

export interface ServiceLivenessProps {
  about: ServiceDescription | null;
  /**
   * The service's observed heartbeat, or null when there is no live plane.
   *
   * Shown beside the pulled health check on purpose: these are two different health planes — what the
   * service says when asked, and whether it is still saying anything at all — and a reader deciding
   * whether to page someone needs both in one place.
   */
  liveness?: Liveness | null;
}

const LIVENESS_TEXT: Record<Liveness, string> = {
  live: 'Heartbeat healthy',
  stale: 'Heartbeat stale — the service has gone quiet',
  silent: 'Never heartbeated — the reporting middleware may not be wired',
};

/**
 * What a service says about itself — the CONTRACT facts only.
 *
 * `Snapshot taken` deliberately moved out of here and into the liveness group. It is a fact about
 * when we last looked, not about the service's shape, and its adjacency to the drift line was the
 * specific reason readers took a release-blocking finding for a timestamp.
 */
export function ServiceAbout({ about }: ServiceAboutProps) {
  if (!about) return <EmptyState message="This service's snapshot has not been loaded." tone="unknown" />;

  return (
    <div className="bz-about">
      {about.description && <p className="bz-about-desc">{about.description}</p>}
      {about.version && <ValueRow label="Service version">{about.version}</ValueRow>}
    </div>
  );
}

/** When we last looked, and whether the service is still answering. */
export function ServiceLiveness({ about, liveness = null }: ServiceLivenessProps) {
  if (!about) return null;

  return (
    <div className="bz-about">
      {/* When we last *tried*, which is the useful reading even when the fetch failed — the failure
          itself belongs to the health panel, where it explains the missing checks. */}
      <ValueRow label="Snapshot taken" title="When the aggregator last fetched this service's spec">
        {about.fetchedAtUtc}
      </ValueRow>
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
