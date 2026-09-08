import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TopicsTopicsItem } from '../../contracts';
import { TopicList } from './TopicList';

const t = (over: Partial<TopicsTopicsItem>): TopicsTopicsItem =>
  ({
    topic: 'orders:create', version: '', reserved: false, consumers: [], producers: [], status: null,
    requestSchema: null, responseSchema: null, messageSchema: null, schemaMismatch: false, ...over,
  }) as TopicsTopicsItem;

/**
 * `topics` is `[]` both when a service genuinely declares none in this direction AND when
 * `topics.json` itself failed to load — those are opposite facts, one about the service and one
 * about the plumbing, and `TopicCatalog` already keeps them apart for the estate-wide table. This is
 * the identical fix for the per-service Consumes/Produces lists, which used to collapse a 503 into
 * "Consumes nothing."/"Produces nothing." — an assertion about the service built on a fact about the
 * feed.
 */
describe('TopicList — feed read failure vs a genuine absence', () => {
  it('renders unknown, not the empty-message, when the topics feed could not be read', () => {
    // The error text itself is deliberately NOT here — a 503 on every card is the plumbing shouting
    // over the estate. The list says the answer is unknown; the Setup page says why.
    render(<TopicList topics={[]} emptyMessage="Consumes nothing." feedError="503" onSetup={() => {}} />);
    expect(screen.queryByText('Consumes nothing.')).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
    expect(screen.getByText(/Unknown — the topics feed could not be read/).closest('.bz-empty'))
      .toHaveAttribute('data-tone', 'unknown');
    expect(screen.getByRole('button', { name: 'See Setup' })).toBeInTheDocument();
  });

  it('renders the empty-message when there genuinely are no topics and the feed read fine', () => {
    render(<TopicList topics={[]} emptyMessage="Consumes nothing." />);
    expect(screen.getByText('Consumes nothing.')).toBeInTheDocument();
  });

  it('renders the real topics rather than the feed error once the feed has data', () => {
    render(<TopicList topics={[t({})]} emptyMessage="none" feedError="503" />);
    expect(screen.getByText('orders:create')).toBeInTheDocument();
  });
});
