export interface VersionSwitcherOption {
  version: string;
  current: boolean;
}

export interface VersionSwitcherProps {
  versions: VersionSwitcherOption[];
  onSelect: (version: string) => void;
  /**
   * Shown instead of the control when the aggregator publishes one entry per topic rather than one
   * per version. That is a fact about the *tool*, not about the estate — the estate may well run
   * four versions — so the copy has to say which, or it becomes a false claim about the reader's own
   * architecture.
   */
  collapsed?: boolean;
}

/**
 * Lets a reader move between the published versions of one topic.
 *
 * Renders nothing when there is only one version: a switcher with a single option implies a choice
 * that does not exist. The versions are the aggregator's own, in its own order, so "newest" here
 * means "last published" and not a semver opinion the mesh has no business forming.
 */
export function VersionSwitcher({ versions, onSelect, collapsed = false }: VersionSwitcherProps) {
  if (collapsed) {
    return (
      <p className="bz-version-switch bz-muted">
        This estate&rsquo;s aggregator publishes one entry per topic, so versions are not
        distinguished here.
      </p>
    );
  }

  if (versions.length <= 1) return null;

  return (
    <div className="bz-version-switch" role="group" aria-label="Topic version">
      <span className="bz-version-switch-label">Version</span>
      {versions.map((option) => (
        <button
          key={option.version}
          type="button"
          className="bz-version-opt"
          aria-current={option.current ? 'true' : undefined}
          data-current={option.current ? 'true' : undefined}
          onClick={() => onSelect(option.version)}
        >
          {option.version || 'unversioned'}
        </button>
      ))}
    </div>
  );
}
