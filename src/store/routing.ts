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
  '#changes': 'changes',
  '#test': 'test',
};

/** The `test` page's prefix, kept out of `PREFIX` because its entity is a pair, not a single string. */
const TEST_PREFIX = '#test/';

export interface Route {
  page: Page;
  selected: string | null;
  selectedService: string | null;
  selectedVersion: string | null;
}

/**
 * Splits `<topic>@<version>` on the LAST '@', so a topic id may itself contain one. A trailing '@'
 * with nothing after it carries no version rather than an empty one — an empty version string is a
 * real value in this catalogue (the unversioned handler), so it must never be produced by accident.
 */
function splitVersion(selected: string): { topic: string; version: string | null } {
  const at = selected.lastIndexOf('@');
  if (at <= 0 || at === selected.length - 1) return { topic: selected, version: null };
  return { topic: selected.slice(0, at), version: selected.slice(at + 1) };
}

export function parseHash(hash: string): Route {
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
        selectedVersion: null,
      };
    }
    // A service with no topic yet is a HALF-FILLED console, which is a real state a reader can be in
    // and a link they can share. Sending it to the estate silently discarded the choice they had
    // already made, and made the page's own promise that "service and topic are both in the URL"
    // false until both were picked.
    const service = (at === -1 ? rest : rest.slice(0, at)).trim();
    if (service) {
      return {
        page: 'test', selectedService: decodeURIComponent(service), selected: null, selectedVersion: null,
      };
    }
    // "#test/" alone selects nothing at all.
    return { page: 'fleet', selected: null, selectedService: null, selectedVersion: null };
  }

  for (const [page, prefix] of Object.entries(PREFIX) as [EntityPage, string][]) {
    if (hash.startsWith(prefix)) {
      const raw = decodeURIComponent(hash.slice(prefix.length));
      // "#service/" with nothing after it is a malformed link, not a selection.
      if (!raw) return { page: 'fleet', selected: null, selectedService: null, selectedVersion: null };
      // Only a topic has versions; '@' anywhere else is part of the name.
      const { topic, version } = page === 'topic' ? splitVersion(raw) : { topic: raw, version: null };
      return { page, selected: topic, selectedService: null, selectedVersion: version };
    }
  }
  const standalone = STANDALONE[hash];
  return { page: standalone ?? 'fleet', selected: null, selectedService: null, selectedVersion: null };
}

export function toHash(
  page: Page, selected: string | null, selectedService: string | null = null,
  selectedVersion: string | null = null,
): string {
  if (page === 'value') return '#value';
  if (page === 'changes') return '#changes';
  if (page === 'test') {
    // A partially-filled console is its own page, not the estate. Returning '#fleet' here used to
    // make the copy promising "service and topic are both in the URL" false until both were chosen,
    // and silently threw away the half the reader had already picked. The console is service-first,
    // so a topic with no service has nothing to address and does fall back to the estate.
    if (selected && selectedService) {
      return `${TEST_PREFIX}${encodeURIComponent(selectedService)}/${encodeURIComponent(selected)}`;
    }
    // '#test' with no service is still the Test page. Returning '#fleet' put the console on screen
    // with an address bar that disagreed, so a reload or a shared link went somewhere else — on the
    // one page whose own copy promises the URL carries its state.
    return selectedService ? `${TEST_PREFIX}${encodeURIComponent(selectedService)}` : '#test';
  }
  if (page === 'fleet' || !selected) return '#fleet';
  const suffix = page === 'topic' && selectedVersion ? `@${selectedVersion}` : '';
  return `${PREFIX[page]}${encodeURIComponent(selected)}${suffix}`;
}

/** Wires the two directions. Returns an unsubscribe, so tests and hot-reload can tear it down. */
export function connectRouting(store: AppStore, window: Window): () => void {
  const applyHash = () => {
    const { page, selected, selectedService, selectedVersion } = parseHash(window.location.hash);
    const view = store.getState().view;
    if (view.page !== page || view.selected !== selected || view.selectedService !== selectedService
      || view.selectedVersion !== selectedVersion) {
      store.dispatch(navigated({ page, selected, selectedService, selectedVersion }));
    }
  };

  applyHash();
  window.addEventListener('hashchange', applyHash);

  // The first write only normalises the address bar (an empty hash becoming '#fleet'), which is not
  // a navigation anyone performed — pushing it meant the first Back press appeared to do nothing.
  let normalised = window.location.hash !== '';
  const unsubscribe = store.subscribe(() => {
    const { page, selected, selectedService, selectedVersion } = store.getState().view;
    const next = toHash(page, selected, selectedService, selectedVersion);
    // Guarded, or writing the hash re-enters applyHash and the two fight each other.
    if (window.location.hash !== next) {
      // pushState, not replaceState: replacing left the browser with no in-app history, so Back from
      // a topic page left the product entirely instead of returning to the estate. Navigation the
      // reader performed is history; the guard above is what keeps store churn out of it.
      if (normalised) window.history.pushState(null, '', next);
      else window.history.replaceState(null, '', next);
      normalised = true;
    }
  });

  return () => {
    window.removeEventListener('hashchange', applyHash);
    unsubscribe();
  };
}
