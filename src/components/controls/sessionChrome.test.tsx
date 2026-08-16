import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignOut } from './SignOut';
import { RefreshButton } from './RefreshButton';
import { CatalogEmpty } from './CatalogEmpty';

/**
 * The two controls a hosted, logged-in deployment adds — and the state a brand-new one starts in.
 *
 * The rule they all share is the one the rest of this library already follows for the collector and
 * for dispatch: a capability the deployment did not wire is *absent*, never disabled. A greyed-out
 * "Sign out" on a mesh with no sessions claims the deployment has authentication and that it is
 * broken; neither is true, and the local/dev case is exactly that mesh.
 */

describe('SignOut', () => {
  it('renders nothing at all when no logout URL is configured', () => {
    const { container } = render(<SignOut />);
    expect(container).toBeEmptyDOMElement();
    expect(render(<SignOut url={null} />).container).toBeEmptyDOMElement();
  });

  it('is a link to the host’s logout endpoint, not an action', () => {
    // The endpoint answers with a redirect. A button with a spinner would dress a page transition up
    // as an operation, and leave the reader watching a stale page while the browser navigates away.
    render(<SignOut url="/benzene/auth/logout" />);

    const link = screen.getByRole('link', { name: 'Sign out' });
    expect(link).toHaveAttribute('href', '/benzene/auth/logout');
  });
});

describe('RefreshButton', () => {
  const noop = () => {};

  it('renders nothing when the mesh cannot be asked for a pass', () => {
    const { container } = render(<RefreshButton available={false} state="idle" onRefresh={noop} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks the mesh for a pass when pressed', () => {
    const onRefresh = vi.fn();
    render(<RefreshButton available state="idle" onRefresh={onRefresh} />);

    screen.getByRole('button', { name: 'Refresh' }).click();

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('refuses a second click while a pass is already running', () => {
    // Client-side politeness on top of the server's rate limit: ten rapid clicks should not become
    // ten requests and a wall of "refreshed recently".
    const onRefresh = vi.fn();
    render(<RefreshButton available state="refreshing" onRefresh={onRefresh} />);

    const button = screen.getByRole('button', { name: 'Refreshing…' });
    expect(button).toBeDisabled();
    button.click();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('says a rate limit calmly, and a failure plainly', () => {
    const { rerender } = render(
      <RefreshButton available state="throttled" note="Refreshed recently — try again shortly." onRefresh={noop} />,
    );
    expect(screen.getByText('Refreshed recently — try again shortly.')).toHaveAttribute('data-tone', 'quiet');

    rerender(<RefreshButton available state="failed" note="503 Service Unavailable" onRefresh={noop} />);
    expect(screen.getByText('503 Service Unavailable')).toHaveAttribute('data-tone', 'bad');
  });

  it('says nothing about an idle refresh', () => {
    render(<RefreshButton available state="idle" note="stale news" onRefresh={noop} />);
    expect(screen.queryByText('stale news')).not.toBeInTheDocument();
  });
});

describe('CatalogEmpty', () => {
  const noop = () => {};

  it('explains the first-run state instead of reporting a missing file', () => {
    render(<CatalogEmpty canRefresh={false} refresh="idle" onRefresh={noop} />);

    expect(screen.getByText('No catalog yet')).toBeInTheDocument();
    expect(screen.getByText(/hasn’t published its first discovery pass/)).toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });

  it('names what the reader is waiting for when there is nothing to press', () => {
    render(<CatalogEmpty canRefresh={false} refresh="idle" onRefresh={noop} />);

    expect(screen.getByText(/scheduled aggregation runs/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the way out as the page’s only control when the mesh can be poked', () => {
    const onRefresh = vi.fn();
    render(<CatalogEmpty canRefresh refresh="idle" onRefresh={onRefresh} />);

    screen.getByRole('button', { name: 'Run a discovery pass' }).click();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/scheduled aggregation runs/)).not.toBeInTheDocument();
  });

  it('carries the refresh’s own state, so a throttled first click is answered here', () => {
    render(
      <CatalogEmpty
        canRefresh
        refresh="throttled"
        refreshNote="Refreshed recently — try again shortly."
        onRefresh={noop}
      />,
    );

    expect(screen.getByText('Refreshed recently — try again shortly.')).toBeInTheDocument();
  });
});
