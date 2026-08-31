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
  it('renders the feed error, not the empty-message, when the topics feed could not be read', () => {
    render(<TopicList topics={[]} emptyMessage="Consumes nothing." feedError="503" />);
    expect(screen.queryByText('Consumes nothing.')).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read — 503/)).toBeInTheDocument();
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
