import type { ServiceDescription, Liveness } from '../../store/selectors';
import { ValueRow } from '../controls/ValueRow';
import { EmptyState } from '../primitives/EmptyState';
import { Stamp } from '../primitives/Stamp';

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
  /** The ticked clock, so every date on this panel carries its age. */
  now: number;
  /**
   * When the collector last heard from this service, as a date.
   *
   * `mesh.md` §4.2 requires a collector to report *last observed at* per edge "rather than
   * collapsing it to a boolean, so a reader can judge staleness for itself" — and the product
   * collapsed it one grain up, into the three-value `Liveness` enum beside this. `stale` tells a
   * reader something is wrong; the date tells them whether it broke during last night's deploy.
   */
  lastSeen?: string | null;
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
export function ServiceLiveness({
  about, liveness = null, now, lastSeen = null,
}: ServiceLivenessProps) {
  if (!about) return null;

  return (
    <div className="bz-about">
      {/* When we last *tried*, which is the useful reading even when the fetch failed — the failure
          itself belongs to the health panel, where it explains the missing checks. */}
      <ValueRow label="Snapshot taken" title="When the aggregator last fetched this service's spec">
        <Stamp iso={about.fetchedAtUtc} now={now} absent="the snapshot carries no fetch time" />
      </ValueRow>
      {liveness && (
        <ValueRow label="Live heartbeat" title="Observed, as opposed to self-reported">
          <span className="bz-about-live" data-liveness={liveness}>
            {LIVENESS_TEXT[liveness]}
          </span>
          {/* The date behind the verdict. `silent` legitimately has none — never heartbeated is an
              absence, not a moment — and saying so is the third state, not a gap. */}
          {liveness !== 'silent' && (
            <> · <Stamp iso={lastSeen} now={now} label="last heard" absent="the plane reported no last-seen time" /></>
          )}
        </ValueRow>
      )}
    </div>
  );
}
