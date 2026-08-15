import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EdgeLivenessChip } from './EdgeLivenessChip';

describe('EdgeLivenessChip — mesh.md §4.2', () => {
  it('renders nothing when the aggregator has not wired the signal', () => {
    const { container } = render(<EdgeLivenessChip activity={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a declared edge that has been traced (the confirmed, unremarkable case)', () => {
    const { container } = render(<EdgeLivenessChip activity={{ lastObservedAt: '2026-08-15T08:50:00Z' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flags a declared edge nothing has ever traced as a decommission candidate', () => {
    render(<EdgeLivenessChip activity={{}} />);
    expect(screen.getByText('unobserved')).toBeInTheDocument();
  });
});
