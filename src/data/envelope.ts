/**
 * Reading a Benzene response envelope (wire-contracts §1.2) the way spec 0.2 requires a receiver to.
 *
 * Two rules, and every place this UI reads an answer off a Benzene endpoint goes through them:
 *
 * 1. **The body speaks before the HTTP status.** The envelope endpoint answers HTTP 200 for every
 *    envelope it processed, whatever the result's status (transport-bindings §1) — an `unauthorized`
 *    or `forbidden` from the pipeline's own auth middleware included. A non-2xx answer means the
 *    *carrier* failed before any envelope was processed — a malformed envelope (400), or
 *    authentication the HTTP host enforces before reading it (401/403) — and then there is no
 *    envelope to read, so the HTTP status is all there is. Reading the body first also keeps older
 *    services working: before spec 0.2 they answered a failed envelope with a non-2xx status *and*
 *    the envelope as the body, and the envelope is still the truth there.
 *
 * 2. **`isSuccessful` is the success signal, and the only one.** A receiver must take it as
 *    authoritative and must not reclassify from `statusCode` text (§1.2): an application-defined
 *    status means nothing to a receiver classifying by string, and a known one is already reflected
 *    in the flag. An envelope that carries no `isSuccessful` has no success signal at all — it is
 *    reported as such, never guessed from its status.
 */

/** The response envelope, as far as a reader can rely on it. */
export interface WireResponse {
  /** The Benzene status (wire-contracts §3) — displayed, never classified. */
  statusCode: string;
  /** The success signal. Required by the spec; absent only from a sender that predates it. */
  isSuccessful?: boolean;
  headers?: Record<string, string>;
  /** The payload, pre-serialized: the handler's response, or the problem document on failure. */
  body?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * The envelope `value` is, or null when it is not one.
 *
 * The discriminator is a string `statusCode`: no problem document (`status` is an integer there),
 * contract document or HTML error page has one. A field of the wrong type disqualifies it rather
 * than being coerced, because a half-read envelope is worse than an honest "not an envelope".
 */
export function asWireResponse(value: unknown): WireResponse | null {
  if (!isRecord(value) || typeof value.statusCode !== 'string') return null;
  if (value.isSuccessful !== undefined && typeof value.isSuccessful !== 'boolean') return null;
  if (value.body != null && typeof value.body !== 'string') return null;
  if (value.headers != null && !isRecord(value.headers)) return null;
  return value as unknown as WireResponse;
}

/** The envelope's own verdict: its `isSuccessful`, or null when it carries none. */
export const successOf = (envelope: WireResponse): boolean | null =>
  typeof envelope.isSuccessful === 'boolean' ? envelope.isSuccessful : null;

/** JSON text parsed, or undefined when it is empty or is not JSON. */
export function parseJson(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The reader-facing reason a failed answer gives, or null when it gives none.
 *
 * A failure body is an RFC 9457 problem document (wire-contracts §1.3), so `detail` is the reason
 * and `title` the fallback. A bare JSON string or a legacy `{ message }` is read too, and text that
 * is not JSON at all is itself the message — a reason in an unexpected shape is still a reason.
 */
export function problemMessage(body: string | null | undefined): string | null {
  const raw = body?.trim();
  if (!raw) return null;
  const parsed = parseJson(raw);
  if (typeof parsed === 'string') return parsed || null;
  if (isRecord(parsed)) {
    for (const key of ['detail', 'title', 'message']) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  }
  return parsed === undefined ? raw : null;
}
