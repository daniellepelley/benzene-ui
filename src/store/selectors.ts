import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { ManifestService, Rag, ServiceStatus } from '../contracts';

/** Declared status → RAG. The single place the mapping lives; the old UI spread it across classes. */
const STATUS_RAG: Record<ServiceStatus, Rag> = {
  healthy: 'green',
  degraded: 'amber',
  unhealthy: 'red',
  unreachable: 'gone',
};

export const ragForStatus = (status: ServiceStatus): Rag => STATUS_RAG[status];

/** Glyphs carried over verbatim from mesh-ui.html's RAG_GLYPH, so the visual language is unchanged. */
export const RAG_GLYPH: Record<Rag, string> = { red: '▲', amber: '◆', green: '●', gone: '○' };

export const selectLoad = (s: RootState) => s.estate.load;
export const selectError = (s: RootState) => s.estate.error;
export const selectFilter = (s: RootState) => s.view.filter;
export const selectPage = (s: RootState) => s.view.page;
export const selectSelected = (s: RootState) => s.view.selected;
const selectServices = (s: RootState) => s.estate.services;
const selectExpanded = (s: RootState) => s.view.expandedServices;

/** The filtered estate, memoised. Filtering is state-derived, so it is testable without a DOM. */
export const selectVisibleServices = createSelector(
  [selectServices, selectFilter],
  (services, filter): ManifestService[] => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return services;
    return services.filter((s) => s.name.toLowerCase().includes(needle));
  },
);

export const selectIsExpanded = (name: string) => (s: RootState) =>
  s.view.expandedServices.includes(name);

/**
 * The estate roll-up the fleet header shows. Derived, never stored — there is exactly one definition
 * of "how many are unhealthy", and both the header and any consumer's own header read it.
 */
export const selectEstateSummary = createSelector([selectServices], (services) => {
  const counts: Record<Rag, number> = { red: 0, amber: 0, green: 0, gone: 0 };
  let drift = 0;
  for (const s of services) {
    counts[ragForStatus(s.status)] += 1;
    if (s.contractDrift) drift += 1;
  }
  return { total: services.length, counts, drift, worst: worstOf(counts) };
});

/** Worst-first, so a single red outranks any number of ambers. */
function worstOf(counts: Record<Rag, number>): Rag | null {
  if (counts.red > 0) return 'red';
  if (counts.amber > 0) return 'amber';
  if (counts.gone > 0) return 'gone';
  return counts.green > 0 ? 'green' : null;
}

export const selectExpandedCount = createSelector([selectExpanded], (e) => e.length);
