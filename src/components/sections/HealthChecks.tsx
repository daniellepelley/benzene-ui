import type { ServiceSnapshot } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';
import { StatusGlyph } from '../primitives/StatusGlyph';

export interface HealthChecksProps {
  snapshot: ServiceSnapshot | null;
}

export function HealthChecks({ snapshot }: HealthChecksProps) {
  if (!snapshot) return <EmptyState message="No snapshot has been fetched for this service yet." />;

  if (snapshot.error) {
    // The snapshot exists but the fetch failed — say what happened rather than showing nothing.
    return <EmptyState message={`Could not reach this service: ${snapshot.error}`} />;
  }

  const health = snapshot.health as { checks?: { name: string; healthy: boolean; message?: string | null }[] } | null;
  if (!health?.checks?.length) {
    return <EmptyState message="This service published no health checks." />;
  }

  return (
    <ul className="bz-health">
      {health.checks.map((check) => (
        <li key={check.name}>
          <StatusGlyph rag={check.healthy ? 'green' : 'red'} label={check.healthy ? 'passing' : 'failing'} />
          <span className="bz-health-name">{check.name}</span>
          {check.message && <span className="bz-health-msg">{check.message}</span>}
        </li>
      ))}
    </ul>
  );
}
