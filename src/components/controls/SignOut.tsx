export interface SignOutProps {
  /**
   * False when the deployment has no logout endpoint — the ordinary local, static-hosting and
   * no-auth case. Absent rather than disabled: a greyed-out "Sign out" on a mesh that has no
   * sessions is worse than silence, because it says the deployment has authentication and that it
   * is broken, and neither is true.
   */
  available: boolean;
  /** What to tell the reader about a failed sign-out. Null while idle. */
  note?: string | null;
  onSignOut: () => void;
}

/**
 * Ending the session, when there is one.
 *
 * A button rather than a link: the container's `onSignOut` is a POST behind the CSRF header the
 * server requires, so it can fail like any other write — an expired session, a network blip, the
 * host briefly down — and is handled like one, with an inline note rather than a page that silently
 * stays signed in while claiming otherwise.
 */
export function SignOut({ available, note, onSignOut }: SignOutProps) {
  if (!available) return null;

  return (
    <span className="bz-signout-wrap">
      <button type="button" className="bz-signout" onClick={onSignOut}>
        Sign out
      </button>
      {note && (
        <span className="bz-refresh-note" data-tone="bad" role="status">
          {note}
        </span>
      )}
    </span>
  );
}
