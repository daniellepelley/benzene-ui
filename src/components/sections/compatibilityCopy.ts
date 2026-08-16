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

// ── Rollouts: who owes a deploy ─────────────────────────────────────────────────────────────────

/**
 * The scope sentence for every rollout surface.
 *
 * It carries one blind spot the schema caveat above does not, and it is a NEW one: a service that
 * declares two versions of a topic it produces may be publishing every message on both, or may be
 * running a split fleet where the new-version messages go unread — and the catalogue cannot tell
 * those apart. So the product states the constraint ("v2 is produced and nothing here handles it")
 * and never the consequence ("messages are being lost"), except in the one case named by
 * `DISJOINT_CLAIM` below.
 */
export const ROLLOUT_SCOPE_CAVEAT =
  'This compares declared payload versions and schemas only. It cannot see upcasters, whether a '
  + 'producer emits both versions of every message, or services outside this estate.';

/**
 * The one categorical claim available, earned only when the produced and consumed version sets are
 * disjoint — no version anybody sends is handled by anybody, so no dual-publishing story rescues it.
 */
export const DISJOINT_CLAIM_NOTE =
  'The versions being sent and the versions being handled do not overlap at all, so this is not a '
  + 'case a producer publishing both versions could be covering.';

/**
 * What the catalogue actually answers for, stated wherever a rollout is.
 *
 * Registration is last-writer-wins and the aggregator's spec poll reaches whichever instance the
 * load balancer chose, so during a rollout two consecutive runs can legitimately disagree. This is
 * the sentence that stops "declared" being read as "deployed".
 */
export const POLLED_INSTANCE_CAVEAT =
  'Each service’s versions are what the instance that answered the last poll declared. During a '
  + 'rollout, instances of the same service can legitimately disagree.';

/**
 * No obligation, and the tool did look. Names WHAT WAS CHECKED, and nothing wider.
 *
 * The previous wording — "every version this service declares is covered on both sides of every
 * topic it touches" — answered "does this service owe a move?" while sounding like "is this
 * service's contract surface healthy?". Those are different questions, and on the estate's one
 * unhealthy service they had opposite answers: it owes nothing precisely because it moved first,
 * and it is the service on fire. A badge that over-claims is a hint; a sentence that over-claims is
 * a claim, and it cost the whole page its credibility.
 */
export const OUTSTANDING_EMPTY = (service: string) =>
  `No contract move is outstanding on ${service}. That is about what ${service} owes, not about `
  + 'whether every topic it touches is healthy — anything it is waiting on appears below.';

/** The capability arm: this aggregator publishes no comparisons, so nothing was checked at all. */
export const OUTSTANDING_NOT_PUBLISHED =
  'This estate’s aggregator does not publish contract comparisons, so whether this service owes a '
  + 'contract move is unknown.';

/** The content arm: there are comparisons, but nothing here has a second version to roll out to. */
export const OUTSTANDING_SINGLE_VERSION =
  'This service declares one version of every topic it touches, so there is nothing to roll out.';

/** What each rollout state is called on screen. Never "safe", never "ready", never "clear". */
export const ROLLOUT_STATE_LABEL: Record<string, string> = {
  complete: 'covered',
  awaitingAdapter: 'move outstanding',
  awaitingOwner: 'completion outstanding',
  unattributable: 'other side not in this estate',
  notCompared: 'not compared',
};

/** The positive label for a breaking change that has been versioned out. */
export const VERSIONED_OUT_COPY =
  'Both sides run both versions. This change is breaking and has been versioned out, so no '
  + 'deployment is coupled to it.';

/**
 * The label for a constraint that is not pending but already broken.
 *
 * "Move outstanding" and "gap live now" are the same state and completely different urgencies: in
 * the first the other side is still on the old version, in the second it has already left and
 * whatever is still talking to it has nothing to talk to. An on-call engineer read the pending
 * wording off a call that was failing 100% and under-rated the incident by a grade, so the two are
 * labelled apart rather than left to the sentence beneath.
 */
export const ROLLOUT_BREACHED_LABEL = 'gap live now';

/**
 * Why the product does not draw a release train, said out loud on the screen where a release manager
 * looks for one.
 *
 * A delivery owner spent real time hunting for the view before concluding it did not exist, and
 * asked for exactly this: an unstated refusal reads as a missing feature, and the next round asks
 * for it again. Stating it converts a perceived gap into a position that can be argued with.
 */
export const NO_RELEASE_TRAIN_COPY =
  'Each constraint below is between the two ends of one topic. They are deliberately not combined '
  + 'into a single set of services to release at once: on an estate where one service touches most '
  + 'topics, that combination degenerates to the whole estate, which is true and useless.';

/** What each rollout state MEANS, on hover, because the labels were being reverse-engineered. */
export const ROLLOUT_STATE_HELP: Record<string, string> = {
  complete: 'Both sides declare every version in play. Nothing is owed on this topic.',
  awaitingAdapter:
    'The side that owns the shape has moved to the new version and the side that has to adapt to it '
    + 'has not. This is the gap that costs something.',
  awaitingOwner:
    'The side that has to adapt is already on the new version and the side that owns the shape has '
    + 'not moved yet. Nothing is broken; the rollout is unfinished.',
  unattributable:
    'One side of this topic has no service in this estate at any version, so nobody here can be '
    + 'named as owing the move.',
  notCompared: 'The versions differ and the schemas could not be compared, so no verdict was earned.',
};

/**
 * The honest limit on the per-service roll-up.
 *
 * Every obligation is startable by construction — one exists only once the other side has published
 * the version — so the roll-up would happily imply every stream can begin today. A service owner
 * found the counter-example in the same round: two of their own obligations were one field crossing
 * their service, and the compatible one could not ship before the breaking one. That dependency is
 * inside a service and mesh cannot see it, so the roll-up says what it counted and stops.
 */
export const BY_SERVICE_SCOPE =
  'No move below is waiting on another service — an obligation only appears once the other side has '
  + 'published the version. Whether one of a service’s own moves depends on another is inside that '
  + 'service, and not visible here.';
