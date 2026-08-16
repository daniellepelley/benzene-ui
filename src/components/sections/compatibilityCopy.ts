/**
 * Every sentence this product says about a contract comparison, in one place.
 *
 * These are not decoration. The recurring defect across three rounds of user testing was the product
 * stating a verdict it had not earned — a green tick over a check nobody ran, a `0` where the answer
 * was "unknown", an `ok` that only meant "no flag was set". The fix is not a nicer word at each
 * render site; it is that the wording for each case is decided once, here, and every surface reads
 * from it.
 *
 * Two rules are encoded in these strings and must survive editing:
 *
 *  1. **Never claim safety.** The scope is structural, schema-only, and inside this estate. Say so.
 *  2. **A capability statement about the tool outranks a content statement about the estate.** If the
 *     aggregator publishes no comparisons, every surface says that, and none of them falls through to
 *     a sentence describing the estate — the estate might have four versions of everything.
 */

/** What a verdict is called on screen. `notCompared` is never "ok", "none" or blank. */
export const VERDICT_LABEL: Record<string, string> = {
  breaking: 'breaking',
  warning: 'warning',
  compatible: 'compatible',
  notCompared: 'not compared',
};

/**
 * The standing caveat, shown wherever a verdict is. Four personas across two rounds singled out the
 * version-compatibility panel's own admission of blindness as the honesty standard the rest of the
 * product should meet; this is that standard, applied.
 */
export const SCOPE_CAVEAT =
  'This compares published payload schemas only. It cannot see upcasters, what a field means, or '
  + 'consumers outside this estate — a change marked compatible can still break something.';

/**
 * The attribution that turns an argument into a setting. `SchemaCompatibilityRules` is configurable
 * and ships a `Strict()` alternative, so a verdict is a function of a rule table rather than a fact
 * about the world. Never render a bare "breaking".
 */
export const VERDICT_ATTRIBUTION = 'by Benzene’s default rules';

/** Why no verdict could be earned. Keyed by `MeshTopicCompatibility.notComparedReason`. */
export const NOT_COMPARED_COPY: Record<string, string> = {
  onlyOneVersion: 'Only one version of this topic is published, so there is nothing to compare.',
  noSchemaPublished: 'Neither version publishes a payload schema, so there was nothing to compare.',
};

/** The fallback when the aggregator names a reason this build does not recognise. */
export const NOT_COMPARED_FALLBACK =
  'This version was not compared against the one before it, and the aggregator did not say why.';

/**
 * Shown when a side exists on one version and not the other. The verdict is still real for the sides
 * that were compared — this names what it does not cover, so it cannot imply a coverage it lacks.
 */
export function notComparedSideCopy(sides: string[], baselineVersion: string | null): string {
  const list = sides.length === 1
    ? sides[0]
    : `${sides.slice(0, -1).join(', ')} and ${sides[sides.length - 1]}`;
  const against = baselineVersion ? ` at ${baselineVersion}` : '';
  return `No ${list} schema is published${against}, so the ${list} side was not compared.`;
}

/** Marks a node beneath which nothing was looked at, so a count is never presented as a total. */
export const TRUNCATED_NODE_COPY = 'The type changed here, so fields beneath it were not compared.';

/**
 * The global capability statement. Used verbatim by the estate tile, the ledger, the topic page and
 * the wiring panel — one sentence, so a reader who sees it twice knows it is the same fact.
 */
export const NOT_PUBLISHED_COPY =
  'This estate’s aggregator did not publish contract comparisons, so no verdict is available.';

/** The ledger group for changes reported without a classification. */
export const UNCLASSIFIED_GROUP_COPY =
  'This aggregator reported that something changed but not what.';

/**
 * The vacuous-truth arm of the version-compatibility panel.
 *
 * `isCompatible` is `producedNotConsumed.length === 0`, so a topic with no in-estate producer
 * computes `true` from an empty evidence set — the shape of every HTTP-fronted topic, and in a real
 * estate it fired on the two topics carrying the most dangerous changes. The boolean is correctly
 * named for what it computes; the defect was the sentence wrapped around it.
 */
export const NO_PRODUCER_COPY =
  'No service in this estate declares producing this topic, so there is nothing to reconcile. '
  + 'Its producers may be outside the estate — a website, an app, or a partner.';
