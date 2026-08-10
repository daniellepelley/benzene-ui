import type { Meta, StoryObj } from '@storybook/react';
import { DataTable, type DataColumn } from './DataTable';
import { Chip } from './Chip';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';

interface Row {
  topic: string;
  consumers: string[];
  status?: string;
  traffic: number | null;
}

const columns: DataColumn<Row>[] = [
  { key: 'topic', header: 'Topic', sortValue: (r) => r.topic, render: (r) => r.topic },
  {
    key: 'consumers',
    header: 'Consumers',
    sortValue: (r) => r.consumers.length,
    render: (r) =>
      r.consumers.length === 0 ? '—' : r.consumers.map((c) => <Chip key={c}>{c}</Chip>),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (r.status ? <Badge rag="red">{r.status}</Badge> : 'ok'),
  },
  {
    key: 'traffic',
    header: 'Traffic',
    numeric: true,
    // Unmeasured sorts below zero, so "nothing is measuring this" never outranks a real count.
    sortValue: (r) => r.traffic ?? -1,
    render: (r) => (r.traffic == null ? '—' : r.traffic.toLocaleString()),
  },
];

const rows: Row[] = [
  { topic: 'orders:get-all', consumers: ['orders-api'], traffic: 41500 },
  { topic: 'orders:create', consumers: ['orders-api'], traffic: 10700 },
  { topic: 'payment:capture', consumers: ['payments-api'], traffic: 10700 },
  { topic: 'shipping:book', consumers: ['shipping-api'], status: 'schema mismatch', traffic: 5200 },
  { topic: 'order:legacy-export', consumers: [], status: 'deprecation candidate', traffic: 0 },
];

const meta = {
  title: 'Primitives/DataTable',
  component: DataTable,
  parameters: {
    docs: {
      description: {
        component:
          'The library had no table — every list was flex rows with wrapping chips, so nothing ' +
          'lined up column-to-column and a reader scanning for the busiest topic was reading, not ' +
          'scanning. Sorting is a callback and the current sort is a prop: the component holds ' +
          'nothing, so the sort a reader chose survives navigating away and back.',
      },
    },
  },
  args: {
    columns,
    rows,
    rowKey: (r: Row) => r.topic,
    sort: { key: 'traffic', direction: 'desc' as const },
  },
} satisfies Meta<typeof DataTable<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SortedByTraffic: Story = {};

/** Sorted alphabetically. The mark moves to the active column; the others show nothing. */
export const SortedByName: Story = {
  args: { sort: { key: 'topic', direction: 'asc' } },
};

/** Unsorted — valid, and what a caller gets if they pass no sort at all. */
export const Unsorted: Story = { args: { sort: null } };

/**
 * Nothing to show. The empty slot is a prop rather than a built-in string because "no rows match
 * this filter" and "this cannot be known yet" are different sentences, and the table cannot tell
 * which one applies.
 */
export const Empty: Story = {
  args: {
    rows: [],
    empty: <EmptyState message="No topic or service matches “ledger”." />,
  },
};

/** One row. The header still earns its space — a reader has to know what the number means. */
export const SingleRow: Story = { args: { rows: rows.slice(0, 1) } };
