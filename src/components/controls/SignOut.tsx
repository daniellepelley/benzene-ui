export interface SignOutProps {
  /**
   * The host's logout endpoint. Absent — the ordinary local, static-hosting and no-auth case — means
   * no control at all.
   */
  url?: string | null;
}

/**
 * Ending the session, when there is one.
 *
 * An anchor rather than a button, because that is what it is: the host's logout endpoint answers
 * with a redirect, so this navigates. Rendering it as a button with a spinner would dress a page
 * transition up as an operation that can fail, and the reader would be looking at a stale page while
 * the browser was already leaving it.
 *
 * Nothing is rendered without a URL. A greyed-out "Sign out" on a mesh that has no sessions is worse
 * than silence: it says the deployment has authentication and that it is broken, and neither is true.
 */
export function SignOut({ url }: SignOutProps) {
  if (!url) return null;

  return (
    <a className="bz-signout" href={url} rel="nofollow">
      Sign out
    </a>
  );
}
