import type { ManifestService, Rag } from '../../contracts';
import { Badge } from '../primitives/Badge';
import { StatusGlyph } from '../primitives/StatusGlyph';
import type { ReactNode } from 'react';

export interface ServiceCardProps {
  service: ManifestService;
  rag: Rag;
  expanded: boolean;
  /** Toggling is a dispatch at the container; the card is told what to call, not what it means. */
  onToggle: (name: string) => void;
  onOpen: (name: string) => void;
  /** The ways out of this card. Supplied by the container, which knows the deployment's URLs. */
  links?: ReactNode;
  /** Rendered only when expanded — the container decides what the detail is. */
  children?: ReactNode;
}

/**
 * One service in the estate.
 *
 * Holds nothing. `expanded` arrives as a prop from the store and toggling dispatches an action —
 * which is what lets "expanding a card" be tested as an action plus a selector assertion rather
 * than a click and a DOM query.
 */
export function ServiceCard({
  service,
  rag,
  expanded,
  onToggle,
  onOpen,
  links,
  children,
}: ServiceCardProps) {
  return (
    <article className="bz-svc" data-service={service.name} data-expanded={expanded}>
      <div className="bz-svc-head">
        <StatusGlyph rag={rag} />
        <Badge rag={rag}>{service.status}</Badge>
        {service.contractDrift && (
          <Badge rag="amber" title="The published spec has changed since the last snapshot">
            drift
          </Badge>
        )}
        <button
          type="button"
          className="bz-svc-name"
          title={`Open ${service.name}`}
          onClick={() => onOpen(service.name)}
        >
          {service.name}
        </button>
        {service.owningTeam && <span className="bz-svc-team">{service.owningTeam}</span>}
        {links}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${service.name}`}
          onClick={() => onToggle(service.name)}
        >
          {expanded ? '▴' : '▾'}
        </button>
      </div>
      {expanded && <div className="bz-svc-body">{children}</div>}
    </article>
  );
}
