import { describe, it, expect } from 'vitest';
import { optionsFromDocument } from './meshApi';

const doc = (attributes: Record<string, string> = {}) => {
  const root = document.createElement('html');
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  return root;
};

const loc = (search: string) => ({ search }) as Location;

describe('deployment configuration', () => {
  it('reads the endpoints a host baked into the document', () => {
    // This is how `Benzene.Mesh.Ui` serves the page from inside a running service. Not reading these
    // is not a cosmetic gap: an embedded dashboard would come up with no live plane at all.
    const options = optionsFromDocument(
      loc(''),
      doc({
        'data-manifest-url': '/artifacts/manifest.json',
        'data-fleet-url': '/benzene/mesh',
        'data-annotations-url': '/benzene/annotations',
      }),
    );

    expect(options).toEqual({
      manifestUrl: '/artifacts/manifest.json',
      fleetEndpoint: '/benzene/mesh',
      annotationsEndpoint: '/benzene/annotations',
    });
  });

  it('lets a query parameter point the page at another estate', () => {
    // A link has to be able to override a baked-in default, or one dashboard can never show another.
    const options = optionsFromDocument(
      loc('?url=https://other.example/manifest.json&fleet=https://other.example/mesh'),
      doc({ 'data-manifest-url': '/artifacts/manifest.json', 'data-fleet-url': '/benzene/mesh' }),
    );

    expect(options.manifestUrl).toBe('https://other.example/manifest.json');
    expect(options.fleetEndpoint).toBe('https://other.example/mesh');
  });

  it('configures nothing when the deployment says nothing', () => {
    // The realistic static-hosting case: the page sits beside the published artifacts, and every
    // endpoint stays undefined so the capabilities slice reports a read-only, collector-less mesh.
    expect(optionsFromDocument(loc(''), doc())).toEqual({
      manifestUrl: undefined,
      fleetEndpoint: undefined,
      annotationsEndpoint: undefined,
    });
  });
});
