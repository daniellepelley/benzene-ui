import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlowList } from './FlowList';
import { fleetTrace } from '../../test/fleetView';

const view = (flows: ReturnType<typeof fleetTrace>[]) =>
  ({ available: true, flows, failing: flows.filter((f) => f.failed).length, total: flows.length, sampledOut: false });

describe('a flow row', () => {
  it('names how the flow ended (mesh.md §4)', () => {
    render(<FlowList view={view([fleetTrace({ traceId: 't1', failed: true, status: 'validation-error' })])} failingOnly={false} />);
    expect(screen.getByText('validation-error')).toBeInTheDocument();
  });

  it('guesses nothing when the collector carried no status', () => {
    const { container } = render(<FlowList view={view([fleetTrace({ traceId: 't1', failed: true })])} failingOnly={false} />);
    // The row's chips are the topic (none here) and the status: no status, no chip.
    expect(container.querySelectorAll('.bz-flow-list li .bz-chip')).toHaveLength(0);
  });
});
