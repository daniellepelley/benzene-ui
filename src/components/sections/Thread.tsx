import type { Annotation } from '../../store/slices/annotationsSlice';
import { EmptyState } from '../primitives/EmptyState';

export interface ThreadProps {
  annotations: Annotation[];
}

/** The discussion against one entity, oldest first — a conversation reads downwards. */
export function Thread({ annotations }: ThreadProps) {
  if (annotations.length === 0) {
    return <EmptyState message="Nothing has been discussed against this yet." />;
  }

  return (
    <ol className="bz-thread">
      {annotations.map((a) => (
        <li key={a.id} className="bz-note">
          <header>
            <strong>{a.author}</strong>
            <time dateTime={a.createdAtUtc}>{new Date(a.createdAtUtc).toLocaleString()}</time>
          </header>
          <p>{a.text}</p>
        </li>
      ))}
    </ol>
  );
}
