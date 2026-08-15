import type { Page } from './slices/viewSlice';
import { navigated } from './slices/viewSlice';
import type { AppStore } from './store';

/**
 * Hash routing, kept as a translation layer rather than a router.
 *
 * The URL is an *input* to the store and a *projection* of it — never a second source of truth. That
 * keeps the rule intact: the page you see is a function of `view.page`/`view.selected`, and the hash
 * is just one way those get set. Deep-linking and the back button therefore work without any
 * component knowing routing exists.
 *
 * Prefixes are carried over from the original UI so existing bookmarks keep working.
 */
type EntityPage = 'service' | 'topic' | 'issue' | 'compose';

const PREFIX: Record<EntityPage, string> = {
  service: '#service/',
  topic: '#topic/',
  issue: '#issue/',
  compose: '#compose/',
};

/** Pages that are about the whole estate rather than one entity, so they carry no selection. */
const STANDALONE: Record<string, Page> = {
  '#fleet': 'fleet',
  '#value': 'value',
};

/** The `test` page's prefix, kept out of `PREFIX` because its entity is a pair, not a single string. */
const TEST_PREFIX = '#test/';

export function parseHash(hash: string): { page: Page; selected: string | null; selectedService: string | null } {
  if (hash.startsWith(TEST_PREFIX)) {
    // <service>/<topic> — split on the first '/' only, since a topic may itself contain '/' once
    // decoded (unlikely, but a service name never contains the raw separator either way).
    const rest = hash.slice(TEST_PREFIX.length);
    const at = rest.indexOf('/');
    if (at > 0 && at < rest.length - 1) {
      return {
        page: 'test',
        selectedService: decodeURIComponent(rest.slice(0, at)),
        selected: decodeURIComponent(rest.slice(at + 1)),
      };
    }
    // "#test/" or "#test/service" with no topic is a malformed/partial link, not a selection.
    return { page: 'fleet', selected: null, selectedService: null };
  }

  for (const [page, prefix] of Object.entries(PREFIX) as [EntityPage, string][]) {
    if (hash.startsWith(prefix)) {
      const selected = decodeURIComponent(hash.slice(prefix.length));
      // "#service/" with nothing after it is a malformed link, not a selection.
      return selected
        ? { page, selected, selectedService: null }
        : { page: 'fleet', selected: null, selectedService: null };
    }
  }
  const standalone = STANDALONE[hash];
  return { page: standalone ?? 'fleet', selected: null, selectedService: null };
}

export function toHash(page: Page, selected: string | null, selectedService: string | null = null): string {
  if (page === 'value') return '#value';
  if (page === 'test') {
    return selected && selectedService
      ? `${TEST_PREFIX}${encodeURIComponent(selectedService)}/${encodeURIComponent(selected)}`
      : '#fleet';
  }
  if (page === 'fleet' || !selected) return '#fleet';
  return `${PREFIX[page]}${encodeURIComponent(selected)}`;
}

/** Wires the two directions. Returns an unsubscribe, so tests and hot-reload can tear it down. */
export function connectRouting(store: AppStore, window: Window): () => void {
  const applyHash = () => {
    const { page, selected, selectedService } = parseHash(window.location.hash);
    const view = store.getState().view;
    if (view.page !== page || view.selected !== selected || view.selectedService !== selectedService) {
      store.dispatch(navigated({ page, selected, selectedService }));
    }
  };

  applyHash();
  window.addEventListener('hashchange', applyHash);

  const unsubscribe = store.subscribe(() => {
    const { page, selected, selectedService } = store.getState().view;
    const next = toHash(page, selected, selectedService);
    // Guarded, or writing the hash re-enters applyHash and the two fight each other.
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  });

  return () => {
    window.removeEventListener('hashchange', applyHash);
    unsubscribe();
  };
}
