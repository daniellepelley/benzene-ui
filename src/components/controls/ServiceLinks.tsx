export interface ServiceLinksProps {
  /** The mesh-hosted spec view for this service, or null when no spec page is deployed beside us. */
  specViewHref?: string | null;
  /**
   * The service's own raw spec URL, already vetted.
   *
   * Vetted, not raw: these come from a self-reported manifest, and a `javascript:` URL handed to an
   * anchor executes on click — `target="_blank"` does not neutralise it. Callers pass the result of
   * `safeHttpUrl`, so a hostile entry costs a missing link rather than a script execution. The type
   * cannot enforce that, which is why it is said here.
   */
  rawSpecHref?: string | null;
  healthHref?: string | null;
}

/**
 * The three ways out of a service card: the mesh's own spec view, the service's raw spec JSON, and
 * its health endpoint.
 *
 * The spec view is a relative link on purpose — the spec page sits beside this one whether both are
 * static files or both are served from a pipeline, so one href resolves in either deployment.
 */
export function ServiceLinks({ specViewHref, rawSpecHref, healthHref }: ServiceLinksProps) {
  if (!specViewHref && !rawSpecHref && !healthHref) return null;

  return (
    <span className="bz-svc-links" onClick={(e) => e.stopPropagation()}>
      {specViewHref && (
        <a href={specViewHref} title="View this service's spec in the mesh-hosted Spec UI">
          spec
        </a>
      )}
      {rawSpecHref && (
        <a
          href={rawSpecHref}
          target="_blank"
          rel="noopener"
          title="The service's raw spec JSON (the Cloud Service contract)"
        >
          raw
        </a>
      )}
      {healthHref && (
        <a href={healthHref} target="_blank" rel="noopener" title="The service's health endpoint">
          health
        </a>
      )}
    </span>
  );
}
