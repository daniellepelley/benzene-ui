export interface EmptyStateProps {
  message: string;
}

/** Says why there is nothing, rather than showing a blank area. */
export function EmptyState({ message }: EmptyStateProps) {
  return <p className="bz-empty">{message}</p>;
}
