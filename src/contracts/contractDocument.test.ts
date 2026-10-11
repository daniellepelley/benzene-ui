import { describe, it, expect } from 'vitest';
import {
  readContractDocument, inlineRefs, refName, ContractDocumentError, SCHEMA_DIALECT,
  type ContractDocument,
} from './contractDocument';
import { exampleFromSchema } from '../store/exampleFromSchema';
import type { JsonSchema } from './generated';
import cases from '../../contracts/contract-document-cases.json';
import legacy from '../../contracts/artifacts/spec.legacy.json';
import sample from '../../contracts/artifacts/spec.json';

/**
 * The reader of both Contract Document shapes, run against the spec's own sample documents
 * (`contracts/contract-document-cases.json`, vendored from the spec repo) and a legacy document.
 */

type Documents = typeof cases.documents;
const documents = cases.documents as Documents & Record<string, unknown>;

const read = (id: keyof Documents) => readContractDocument(documents[id]);

describe('the conformance parseCases', () => {
  // A row keyed by topic asserts `versionPresent`/`version` and `responsePresent`, where "present:
  // false" means genuinely absent (conformance/README.md). The include-list case is a generator's
  // option, which a viewer has no use for, so only the parse and the dialect cases apply here.
  type Row = { topic: string; versionPresent?: boolean; version?: string; responsePresent?: boolean };
  type Expected = { schemaDialect?: string; service?: string; requests?: Row[]; events?: Row[]; sends?: Row[] };
  const parseCases = (cases.parseCases as { name: string; documentRef: string; options?: unknown; expected?: Expected; expectedError?: { kind: string } }[])
    .filter((c) => c.options === undefined);

  // Rows are keyed by (topic, version) and subset-matched: each row claims the first entry with its
  // topic — and its version, where the row gives one — that no earlier row claimed.
  const assertRows = (rows: Row[] | undefined, actual: { topic: string; version: string | null; response?: JsonSchema | null }[]) => {
    if (!rows) return;
    const claimed = new Set<number>();
    for (const row of rows) {
      const at = actual.findIndex(
        (a, i) => !claimed.has(i) && a.topic === row.topic && (row.version === undefined || a.version === row.version),
      );
      expect(at, `no entry for ${row.topic}${row.version ? `@${row.version}` : ''}`).toBeGreaterThanOrEqual(0);
      claimed.add(at);
      const entry = actual[at]!;
      if (row.versionPresent !== undefined) expect(entry.version !== null).toBe(row.versionPresent);
      if (row.responsePresent !== undefined) expect(entry.response != null).toBe(row.responsePresent);
    }
  };

  it.each(parseCases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const raw = documents[c.documentRef as keyof Documents];
    if (c.expectedError) {
      expect(() => readContractDocument(raw)).toThrow(ContractDocumentError);
      try {
        readContractDocument(raw);
      } catch (error) {
        expect((error as ContractDocumentError).kind).toBe(c.expectedError.kind);
      }
      return;
    }
    const doc = readContractDocument(raw);
    const expected = c.expected!;
    if (expected.schemaDialect !== undefined) expect(doc.schemaDialect).toBe(expected.schemaDialect);
    if (expected.service !== undefined) expect(doc.service).toBe(expected.service);
    assertRows(expected.requests, doc.requests);
    assertRows(expected.events, doc.events);
    assertRows(expected.sends, doc.sends);
  });

  it('covers every parse case but the generator-only include-list one', () => {
    expect(parseCases.length).toBe((cases.parseCases as unknown[]).length - 1);
  });
});

describe('reading the Contract Document', () => {
  it('reads the identity, the hashes and the three lists of the canonical document', () => {
    const doc = read('canonical');
    expect(doc).toMatchObject({
      shape: 'contract',
      schemaDialect: SCHEMA_DIALECT,
      service: 'conformance',
      serviceVersion: null,
      contractHash: documents.canonical.contractHash,
      registrationHash: documents.canonical.registrationHash,
    });
    expect(doc.requests.map((r) => r.topic)).toEqual(['conformance:greet']);
    expect(doc.events.map((e) => e.topic)).toEqual(['conformance:greeted']);
    expect(doc.sends.map((s) => s.topic)).toEqual(['conformance:log', 'conformance:lookup']);
    expect(Object.keys(doc.schemas)).toHaveLength(6);
  });

  it('reads an absent response as no payload, on a request and on a send', () => {
    const canonical = read('canonical');
    expect(canonical.sends.find((s) => s.topic === 'conformance:log')!.response).toBeNull();
    expect(canonical.sends.find((s) => s.topic === 'conformance:lookup')!.response).toEqual({
      $ref: '#/components/schemas/LookupResponse',
    });
    expect(read('versioned').requests.find((r) => r.topic === 'payments:refund')!.response).toBeNull();
  });

  it('keeps `{}` — any payload — distinct from an absent response', () => {
    const doc = readContractDocument({ ...documents.canonical, sends: [{ topic: 'x:y', request: {}, response: {} }] });
    expect(doc.sends[0]!.response).toEqual({});
  });

  it('keeps two versions of one topic apart, and an unversioned entry unversioned', () => {
    const doc = read('versioned');
    expect(doc.requests.map((r) => [r.topic, r.version])).toEqual([
      ['payments:capture', 'v1'],
      ['payments:capture', 'v2'],
      ['payments:refund', null],
    ]);
    expect(doc.requests[1]!.httpMappings).toEqual([{ method: 'POST', path: '/payments' }]);
  });

  it('ignores a benzene: entry the producer should not have listed', () => {
    expect(read('withBenzeneEntry').requests.map((r) => r.topic)).toEqual(['orders:create']);
  });

  it('refuses a schema dialect it does not know, rather than misreading every schema', () => {
    expect(() => read('unknownDialect' as keyof Documents)).toThrow(/json-schema-2020-12/);
  });

  it('records whether the author supplied an example — and only then', () => {
    const doc = readContractDocument(sample);
    expect(doc.requests.find((r) => r.topic === 'orders:create')).toMatchObject({ hasExample: true });
    expect(doc.requests.find((r) => r.topic === 'orders:get-all')).toMatchObject({ hasExample: false });
  });
});

describe('reading a legacy (spec ≤ 0.2) document', () => {
  const doc: ContractDocument = readContractDocument(legacy);

  it('takes the identity from info.*', () => {
    expect(doc).toMatchObject({
      shape: 'legacy',
      schemaDialect: null,
      service: 'Orders API',
      serviceVersion: '2.4.0',
      description: 'Accepts and tracks customer orders through to fulfilment.',
      contractHash: null,
      registrationHash: null,
      messageEndpoint: '/benzene/invoke',
      transports: ['http', 'sqs'],
    });
  });

  it('drops the reserved benzene: entries it listed', () => {
    expect(doc.requests.map((r) => r.topic)).toEqual(['orders:create', 'orders:get-all']);
  });

  it('leaves its outbound in events, where the old shape folded sends', () => {
    expect(doc.events.map((e) => e.topic)).toEqual(['payment:capture', 'order:legacy-export']);
    expect(doc.sends).toEqual([]);
  });

  it('prefers the new fields where a document carries both', () => {
    const both = readContractDocument({ ...legacy, schemaDialect: SCHEMA_DIALECT, service: 'orders', serviceVersion: '3.0.0' });
    expect(both).toMatchObject({ shape: 'contract', service: 'orders', serviceVersion: '3.0.0' });
  });

  it('reads anything else as empty rather than failing', () => {
    expect(readContractDocument({ type: 'benzene', topics: {} })).toMatchObject({ requests: [], events: [], sends: [], service: null });
    expect(readContractDocument(null)).toMatchObject({ requests: [], events: [], sends: [] });
  });
});

describe('inlining $refs for reading', () => {
  const closure = read('closure');
  const schemas = closure.schemas;

  it('inlines a component under its own name', () => {
    expect(inlineRefs({ $ref: '#/components/schemas/Ok' }, schemas)).toEqual({
      type: 'object', title: 'Ok', properties: { ok: { type: 'boolean' } }, required: ['ok'],
    });
  });

  it('stops at a cycle, leaving the ref that names it', () => {
    const a = inlineRefs({ $ref: '#/components/schemas/A' }, schemas)!;
    const b = a.properties!.b!;
    expect(b.title).toBe('B');
    expect(b.properties!.a).toEqual({ $ref: '#/components/schemas/A' });
  });

  it('inlines array items and map values', () => {
    const c = inlineRefs({ $ref: '#/components/schemas/Collections' }, schemas)!;
    expect((c.properties!.list!.items as JsonSchema).title).toBe('Item');
    expect((c.properties!.map!.additionalProperties as JsonSchema).title).toBe('Value');
  });

  it('folds allOf into the object it describes, and keeps oneOf as alternatives', () => {
    const poly = inlineRefs({ $ref: '#/components/schemas/Poly' }, schemas)!;
    expect(poly.allOf).toBeUndefined();
    expect(poly.properties).toEqual({ name: { type: 'string' } });
    expect((poly.oneOf as JsonSchema[]).map((m) => m.title)).toEqual(['Cat', 'Dog']);
  });

  it('reads the nullable-reference wrapper as the nullable object it is', () => {
    const doc = readContractDocument(sample);
    const create = inlineRefs({ $ref: '#/components/schemas/CreateOrder' }, doc.schemas)!;
    expect(create.properties!.shippingAddress).toMatchObject({
      type: 'object', nullable: true, title: 'Address', required: ['line1', 'postcode'],
    });
  });

  it("ignores a $ref's sibling keywords, as OpenAPI 3.0 does", () => {
    expect(inlineRefs({ $ref: '#/components/schemas/Ok', description: 'ignored', type: 'string' }, schemas)).toEqual(
      inlineRefs({ $ref: '#/components/schemas/Ok' }, schemas),
    );
    expect(exampleFromSchema({ $ref: '#/components/schemas/Ok', example: 'ignored' }, schemas)).toEqual({ ok: false });
  });

  it('leaves an unknown component as the ref', () => {
    expect(inlineRefs({ $ref: '#/components/schemas/Nope' }, schemas)).toEqual({ $ref: '#/components/schemas/Nope' });
    expect(refName('#/components/schemas/Nope')).toBe('Nope');
    expect(refName('https://example.com/x.json')).toBeNull();
  });
});

describe('generating an example from a Contract Document schema', () => {
  const schemas = read('closure').schemas;
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

  it('resolves $refs through components.schemas', () => {
    expect(exampleFromSchema(ref('Collections'), schemas)).toEqual({ list: [{ id: 'string' }], map: {} });
  });

  it('terminates on a $ref cycle, cutting it to the empty value of its type', () => {
    expect(exampleFromSchema(ref('A'), schemas)).toEqual({ b: { a: {} } });
  });

  it('merges allOf and takes the first oneOf alternative', () => {
    expect(exampleFromSchema(ref('Poly'), schemas)).toEqual({ name: 'string', meow: 'string' });
  });

  it('reads through the nullable-reference wrapper', () => {
    const doc = readContractDocument(sample);
    expect(exampleFromSchema(ref('CreateOrder'), doc.schemas)).toEqual({
      customerId: '00000000-0000-0000-0000-000000000000',
      lines: [{ sku: 'string', quantity: 1 }],
      shippingAddress: { line1: 'string', postcode: 'string' },
    });
  });

  it('terminates on a nullable self-reference', () => {
    const tree = {
      TreeNode: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parent: { type: 'object', nullable: true, allOf: [ref('TreeNode')] },
          children: { type: 'array', items: ref('TreeNode') },
        },
      },
    };
    expect(exampleFromSchema(ref('TreeNode'), tree)).toEqual({ name: 'string', parent: {}, children: [{}] });
  });

  it('does not guess at a ref it cannot resolve', () => {
    expect(exampleFromSchema(ref('Missing'), schemas)).toEqual({});
    expect(exampleFromSchema(ref('Missing'))).toEqual({});
  });
});
