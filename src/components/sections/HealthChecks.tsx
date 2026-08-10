import type { Rag, ServiceSnapshot } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';

export interface HealthChecksProps {
  snapshot: ServiceSnapshot | null;
}

/** The check-status vocabulary, carried over verbatim. Anything unrecognised is amber, not green —
 *  a status this UI has never seen is a reason to look, not a reason to relax. */
const RAG_FOR: Record<string, Rag> = { ok: 'green', warning: 'amber', failed: 'red' };
const ragFor = (status: string): Rag => RAG_FOR[status] ?? 'amber';

const formatValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

/**
 * A service's health checks, keyed by name.
 *
 * `healthChecks` is a **map**, not a list — one entry per registered check, named by its key. An
 * earlier version of this component read `health.checks[]`, a shape the contract has never had, so
 * every service in the demo reported "published no health checks" while publishing three.
 *
 * Detail is rendered only for a non-ok check. A passing check needs no explanation; a warning or a
 * failure needs the "why", and the check's own data bag is where the actionable discriminators live.
 */
export function HealthChecks({ snapshot }: HealthChecksProps) {
  if (!snapshot) return <EmptyState message="No snapshot has been fetched for this service yet." tone="unknown" />;

  if (snapshot.error) {
    // The snapshot exists but the fetch failed — say what happened rather than showing nothing.
    return <EmptyState message={`Could not reach this service: ${snapshot.error}`} tone="unknown" />;
  }

  const checks = Object.entries(snapshot.health?.healthChecks ?? {}) as [
    string,
    { status?: string; type?: string; data?: Record<string, unknown>; dependencies?: { kind: string; name: string }[] },
  ][];

  if (checks.length === 0) {
    return <EmptyState message="This service published no health checks." />;
  }

  return (
    <ul className="bz-health">
      {checks.map(([name, check]) => {
        const status = check.status ?? 'unknown';
        const data = Object.entries(check.data ?? {});
        return (
          <li key={name} data-status={status}>
            <div className="bz-health-row">
              <StatusGlyph rag={ragFor(status)} label={status} />
              <span className="bz-health-name">{name}</span>
              {check.type && check.type !== name && <span className="bz-health-type">{check.type}</span>}
              <span className="bz-health-status">{status}</span>
              {(check.dependencies ?? []).map((d) => (
                <Chip key={`${d.kind}:${d.name}`} title={`${d.kind} dependency`}>
                  {d.kind} <b>{d.name}</b>
                </Chip>
              ))}
            </div>
            {status !== 'ok' &&
              (data.length > 0 ? (
                <dl className="bz-health-detail">
                  {data.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="bz-health-detail-empty">No further detail reported by this check.</p>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
