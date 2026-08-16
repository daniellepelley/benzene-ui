import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Where the reader is sent to get out. Rendered as the recovery action. */
  onReset?: () => void;
  resetLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one page's failure from taking the whole product down.
 *
 * There was no boundary at all, so a single selector reading a field an artifact did not carry
 * white-screened every page — and the back button did not recover it, because the crashed tree stays
 * crashed until something remounts. An on-call engineer clicking a link the product itself handed
 * them got a blank page and no way back; the rational response to that is to close the tab and go to
 * the logs, and not to come back.
 *
 * So the contract here is deliberately narrow. It does NOT try to make the page work. It says what
 * happened, admits the product is at fault rather than the estate, and gives one way out. A caught
 * error is still a bug and should still be fixed — this only stops it costing everything else on
 * screen.
 *
 * A class component because React has no hook equivalent: `componentDidCatch` is the only way to
 * intercept a render throw.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console, not swallowed: the boundary exists to protect the reader, not to hide the defect from
    // whoever is debugging it.
    console.error('Mesh UI failed to render this view', error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  public override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bz-page">
        <section className="bz-card">
          <h3>This view could not be rendered</h3>
          <p className="bz-muted">
            Something in the mesh UI failed while drawing this page. That is a fault in the product,
            not a statement about your estate — the data behind it may be perfectly fine.
          </p>
          <p className="bz-muted bz-boundary-detail">{error.message}</p>
          <button type="button" onClick={this.reset}>
            {this.props.resetLabel ?? 'Back to the estate'}
          </button>
        </section>
      </div>
    );
  }
}
