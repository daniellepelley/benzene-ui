import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface DataColumn<Row> {
  key: string;
  header: string;
  /** Right-aligned with tabular figures. Use for anything a reader compares down the column. */
  numeric?: boolean;
  /** Omit to make the column unsortable — a column of chips rarely has a meaningful order. */
  sortValue?: (row: Row) => string | number;
  render: (row: Row) => ReactNode;
  /** Long free text; lets the cell wrap instead of forcing a horizontal scroll. */
  wrap?: boolean;
}

export interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption?: string;
  sort?: { key: string; direction: SortDirection } | null;
  onSort?: (key: string) => void;
  empty?: ReactNode;
}

/**
 * A real table, for data that is actually tabular.
 *
 * The library had none — every list was flex rows with wrapping chips. Nothing lined up
 * column-to-column, numbers could not be right-aligned or given tabular figures, two rows could not
 * be compared, and each row cost an unpredictable height because the chips wrapped differently
 * depending on their contents. A reader scanning for the busiest topic was reading, not scanning.
 *
 * Sorting is a callback and the current sort is a prop: the component holds nothing, so the sort a
 * reader chose is store state like everything else and survives navigating away and back.
 */
export function DataTable<Row>({
  columns, rows, rowKey, caption, sort, onSort, empty,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const sorted = (() => {
    const column = columns.find((c) => c.key === sort?.key);
    if (!column?.sortValue || !sort) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  })();

  return (
    <div className="bz-table-wrap">
      <table className="bz-table">
        {caption && <caption className="bz-table-caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              // `aria-sort` is what a screen reader announces, and doubles as the styling hook.
              const ariaSort = !column.sortValue
                ? undefined
                : active
                  ? sort!.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
              return (
                <th key={column.key} aria-sort={ariaSort} data-numeric={column.numeric || undefined}>
                  {column.sortValue ? (
                    <button type="button" className="bz-th-sort" onClick={() => onSort?.(column.key)}>
                      {column.header}
                      <span aria-hidden="true" className="bz-th-mark">
                        {active ? (sort!.direction === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-numeric={column.numeric || undefined} data-wrap={column.wrap || undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
