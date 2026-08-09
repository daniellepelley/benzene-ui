export interface ComposerProps {
  draft: string;
  author: string;
  canPost: boolean;
  posting: boolean;
  error: string | null;
  /** Absent when the mesh is read-only — the composer then explains itself rather than vanishing. */
  onPost?: () => void;
  onDraftChange: (text: string) => void;
  onAuthorChange: (author: string) => void;
}

/**
 * Add a note against a topic or service.
 *
 * Every field is a prop and every keystroke is a callback — the draft lives in the store, so a
 * half-typed note survives navigating away and back, and "can I post this" is a selector rather
 * than a condition scattered through the component.
 */
export function Composer({
  draft,
  author,
  canPost,
  posting,
  error,
  onPost,
  onDraftChange,
  onAuthorChange,
}: ComposerProps) {
  if (!onPost) {
    return (
      <p className="bz-composer-readonly">
        This mesh is read-only — no annotation endpoint is configured.
      </p>
    );
  }

  return (
    <form
      className="bz-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onPost();
      }}
    >
      <input
        aria-label="Your name"
        placeholder="Your name"
        value={author}
        onChange={(e) => onAuthorChange(e.target.value)}
      />
      <textarea
        aria-label="Note"
        placeholder="Add a note…"
        rows={3}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
      />
      <button type="submit" disabled={!canPost}>
        {posting ? 'Posting…' : 'Post'}
      </button>
      {error && <p className="bz-composer-error">{error}</p>}
    </form>
  );
}
