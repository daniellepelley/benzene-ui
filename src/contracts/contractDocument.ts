import type { JsonSchema } from './generated';

/**
 * Reading a service's Contract Document — the document `benzene:spec` answers with — in one place.
 *
 * Two shapes are in the wild, because the language ports adopt a spec release at different times
 * and an estate runs whatever each service was last deployed with:
 *
 * - **the Contract Document** (contract-document.md, spec 0.3): `schemaDialect`, `service`,
 *   `serviceVersion`, `versionScheme`, `description`, `contractHash`, `registrationHash`, and three
 *   lists — `requests`, `events` (topics this service defines) and `sends` (topics others define).
 *   An absent `response` means *no payload*; `{}` means *any payload*.
 * - **the legacy document** (spec ≤ 0.2): `openapi`, `info.{title,version,description}`, `tags`,
 *   reserved `benzene:` entries flagged `reserved: true`, and outbound sends folded into `events`
 *   (there is no way to tell them apart afterwards, so they stay events).
 *
 * Every reader of a spec document goes through `readContractDocument`; nothing else in the UI looks
 * at `info` or `openapi`. Two readers would drift — the spec viewer and the service page once
 * disagreed about where a version lives — and the transition window is exactly when they would.
 *
 * `benzene:` entries are dropped whichever shape they arrive in: a producer MUST NOT list them in
 * the new shape, and a consumer MUST ignore any it meets (contract-document.md §1). The legacy
 * shape listed them on purpose; the reader drops them all the same, so a reader is never shown
 * Benzene's own utilities as though they were the service's contract.
 */

/** The one schema dialect this build reads (contract-document.md §1). */
export const SCHEMA_DIALECT = 'openapi-3.0';

/** Where every `$ref` in a Contract Document points (contract-document.md §1). */
export const COMPONENT_REF_PREFIX = '#/components/schemas/';

export type ContractDocumentShape = 'contract' | 'legacy';

export interface ContractRequest {
  topic: string;
  /** Absent and empty differ in the spec; a producer never writes `""`, so both read as unversioned. */
  version: string | null;
  httpMappings: { method: string; path: string }[];
  request: JsonSchema | null;
  /** `null` is an ABSENT response: the handler returns no payload. `{}` is "any payload". */
  response: JsonSchema | null;
  /** Whether the document carries an author-supplied example — `example` may itself be `null`. */
  hasExample: boolean;
  example: unknown;
}

export interface ContractEvent {
  topic: string;
  version: string | null;
  message: JsonSchema | null;
  hasExample: boolean;
  example: unknown;
}

export interface ContractSend {
  topic: string;
  version: string | null;
  request: JsonSchema | null;
  /** `null` is an ABSENT response: one-way, nothing comes back. `{}` is a reply of any shape. */
  response: JsonSchema | null;
}

/** One reading of either shape. Fields the source did not carry are `null`, never invented. */
export interface ContractDocument {
  shape: ContractDocumentShape;
  /** `null` for a legacy document, which predates the field. */
  schemaDialect: string | null;
  service: string | null;
  serviceVersion: string | null;
  versionScheme: string | null;
  description: string | null;
  messageEndpoint: string | null;
  transports: string[];
  contractHash: string | null;
  registrationHash: string | null;
  requests: ContractRequest[];
  events: ContractEvent[];
  sends: ContractSend[];
  schemas: Record<string, JsonSchema>;
}

export type ContractDocumentErrorKind = 'unknown-schema-dialect';

/** A document this build must refuse rather than misread. */
export class ContractDocumentError extends Error {
  readonly kind: ContractDocumentErrorKind;
  constructor(kind: ContractDocumentErrorKind, message: string) {
    super(message);
    this.name = 'ContractDocumentError';
    this.kind = kind;
  }
}

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const schemaOf = (v: unknown): JsonSchema | null => (isRecord(v) ? (v as JsonSchema) : null);
const listOf = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/** Benzene's own topics, which a reader never lists as a service's contract (§1). */
export const isBenzeneTopic = (topic: string) => topic.startsWith('benzene:');

/** An entry this reader keeps: it has a topic, and that topic is not Benzene's own. */
const ownEntry = (e: Json): e is Json & { topic: string } =>
  typeof e.topic === 'string' && !isBenzeneTopic(e.topic) && e.reserved !== true;

/**
 * Normalises either document shape into one reading.
 *
 * Lenient about what it does not need — a missing list reads as empty, an unknown top-level field is
 * ignored (§1 says a consumer MUST) — and strict about the one thing it cannot read past: a
 * `schemaDialect` this build does not know is refused (§1: a consumer MUST reject it), because every
 * schema in such a document would be read in the wrong language.
 */
export function readContractDocument(raw: unknown): ContractDocument {
  const doc: Json = isRecord(raw) ? raw : {};
  const dialect = doc.schemaDialect;
  if (dialect !== undefined && dialect !== SCHEMA_DIALECT) {
    throw new ContractDocumentError(
      'unknown-schema-dialect',
      `The document's schemaDialect is ${JSON.stringify(dialect)}; this viewer reads only "${SCHEMA_DIALECT}"`,
    );
  }

  const info = isRecord(doc.info) ? doc.info : {};
  const shape: ContractDocumentShape = dialect === undefined && ('openapi' in doc || 'info' in doc) ? 'legacy' : 'contract';
  // A document with no schemaDialect has an unknown dialect (§1, spec 1.1). The one exception is the
  // legacy document, which predates the field and is recognised by its `openapi`/`info` members:
  // this viewer still reads it, by design, so an estate mid-upgrade stays visible.
  if (dialect === undefined && shape === 'contract') {
    throw new ContractDocumentError(
      'unknown-schema-dialect',
      `The document has no schemaDialect; this viewer reads only "${SCHEMA_DIALECT}" (or a legacy openapi/info document)`,
    );
  }
  const components = isRecord(doc.components) && isRecord(doc.components.schemas) ? doc.components.schemas : {};

  return {
    shape,
    schemaDialect: str(dialect),
    // The new fields win; `info.*` is the legacy home of the same facts.
    service: str(doc.service) ?? str(info.title),
    serviceVersion: str(doc.serviceVersion) ?? str(info.version),
    versionScheme: str(doc.versionScheme),
    description: str(doc.description) ?? str(info.description),
    messageEndpoint: str(doc.messageEndpoint),
    transports: Array.isArray(doc.transports) ? doc.transports.filter((t): t is string => typeof t === 'string') : [],
    contractHash: str(doc.contractHash),
    registrationHash: str(doc.registrationHash),
    requests: listOf(doc.requests).filter(ownEntry).map((r) => ({
      topic: r.topic,
      version: str(r.version),
      httpMappings: listOf(r.httpMappings)
        .filter((h) => typeof h.method === 'string' && typeof h.path === 'string')
        .map((h) => ({ method: h.method as string, path: h.path as string })),
      request: schemaOf(r.request),
      response: schemaOf(r.response),
      hasExample: 'example' in r,
      example: r.example,
    })),
    events: listOf(doc.events).filter(ownEntry).map((e) => ({
      topic: e.topic,
      version: str(e.version),
      message: schemaOf(e.message),
      hasExample: 'example' in e,
      example: e.example,
    })),
    sends: listOf(doc.sends).filter(ownEntry).map((s) => ({
      topic: s.topic,
      version: str(s.version),
      request: schemaOf(s.request),
      response: schemaOf(s.response),
    })),
    schemas: components as Record<string, JsonSchema>,
  };
}

/** The component a `$ref` names, or `null` for anything that is not a local component ref. */
export const refName = (ref: unknown): string | null =>
  typeof ref === 'string' && ref.startsWith(COMPONENT_REF_PREFIX) ? ref.slice(COMPONENT_REF_PREFIX.length) : null;

const COMPOSITIONS = ['allOf', 'anyOf', 'oneOf'] as const;

/**
 * A schema with its `$ref`s inlined, for reading: a finite tree a renderer can walk without knowing
 * about components.
 *
 * - A `$ref` is replaced by its component, which carries the component's name as its `title` when it
 *   has none of its own — so a reader sees `CreateOrder`, the name a generated client calls it. The
 *   ref's sibling keywords are ignored, as OpenAPI 3.0 ignores a Reference Object's siblings.
 * - A ref to a component already being expanded on the current path is LEFT as the `$ref`: the tree
 *   stays finite on a recursive type, and the renderer names the component instead of recursing.
 *   An unknown component is left as the `$ref` too — shown, not guessed at.
 * - `allOf` is flattened into its parent (properties and required merged), which is how the
 *   nullable-reference wrapper (§4.2, `{"type":"object","nullable":true,"allOf":[{"$ref":…}]}`) and
 *   plain composition both read as the object they describe. `anyOf`/`oneOf` are inlined, not merged:
 *   they are alternatives, and merging alternatives would describe a payload nobody sends.
 */
export function inlineRefs(
  schema: JsonSchema | null,
  schemas: Record<string, JsonSchema>,
  path: readonly string[] = [],
): JsonSchema | null {
  if (!schema) return null;

  const name = refName(schema.$ref);
  if (name !== null) {
    const target = schemas[name];
    if (!target || path.includes(name)) return { $ref: schema.$ref };
    // A Reference Object's siblings are ignored, as OpenAPI 3.0 ignores them (§6.2 step 3).
    const inlined = inlineRefs(target, schemas, [...path, name])!;
    return inlined.title === undefined ? { ...inlined, title: name } : inlined;
  }

  const out: JsonSchema = { ...schema };
  if (isRecord(schema.properties)) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, inlineRefs(v, schemas, path) ?? v]),
    );
  }
  if (isRecord(schema.items)) out.items = inlineRefs(schema.items as JsonSchema, schemas, path)!;
  if (isRecord(schema.additionalProperties)) {
    out.additionalProperties = inlineRefs(schema.additionalProperties as JsonSchema, schemas, path);
  }
  for (const key of COMPOSITIONS) {
    const members = schema[key];
    if (Array.isArray(members)) out[key] = members.map((m) => (isRecord(m) ? inlineRefs(m as JsonSchema, schemas, path) : m));
  }

  const allOf = out.allOf;
  if (Array.isArray(allOf) && allOf.every(isRecord) && allOf.every((m) => refName(m.$ref) === null)) {
    // Every member resolved: fold them in. A member still holding a `$ref` is a cut cycle, so the
    // composition stays as written rather than losing the one thing that names the recursion.
    delete out.allOf;
    const properties: Record<string, JsonSchema> = {};
    const required = new Set<string>();
    for (const member of [...(allOf as JsonSchema[]), schema]) {
      Object.assign(properties, member === schema ? out.properties : member.properties);
      for (const r of member.required ?? []) required.add(r);
    }
    const first = allOf[0] as JsonSchema | undefined;
    if (Object.keys(properties).length > 0) out.properties = properties;
    if (required.size > 0) out.required = [...required];
    if (out.type === undefined && first?.type !== undefined) out.type = first.type;
    if (out.title === undefined && allOf.length === 1 && first?.title !== undefined) out.title = first.title;
    if (out.description === undefined && allOf.length === 1 && first?.description !== undefined) {
      out.description = first.description;
    }
  }
  return out;
}
