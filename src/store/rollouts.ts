import type { TopicsTopicsItem, TopicsVersionCompatibilityItem } from '../contracts';

/**
 * The join.
 *
 * The aggregator computes both halves of the deployment question and returns them in one statement
 * without either reading the other: `BuildVersionCompatibility` knows WHO is on which version, and
 * `ApplyCrossVersionCompatibility` knows WHETHER the difference between two versions matters. A
 * version being uncovered is only interesting when the gap is one that breaks somebody; a breaking
 * change only obliges anybody when a version is actually uncovered. Every question this module
 * answers is the product of those two facts, and neither alone gets it right.
 *
 * Nothing here needs new data. It is a derivation over `topics.json` exactly as it ships.
 *
 * What this module deliberately does NOT do:
 *  - It does not produce a plan, a sequence, or a schedule. It states the constraint between the two
 *    ends of one topic. Mesh has no pipeline and no future tense.
 *  - It does not compute a transitive coordination set. Closure over "must move together" collapses
 *    to the whole estate the moment one service is a hub, at which point it stops being advice.
 *  - It does not claim messages are being lost. See `disjoint` for the one case where it may.
 */

/** Which side of a topic owns the shape; the other side is the one that must adapt to it. */
export type OwnerSide = 'producers' | 'consumers';

export type RolloutState =
  /** Every declared version is covered on both sides. Nothing is owed. */
  | 'complete'
  /** The owner declares the current version and the adapter does not. The gap is live now. */
  | 'awaitingAdapter'
  /** The adapter declares the current version and the owner does not. Unfinished, not broken. */
  | 'awaitingOwner'
  /** One side has no in-estate service at any version, so nobody here can be named. */
  | 'unattributable'
  /** The versions differ and the schemas could not be compared. Never a breaking claim. */
  | 'notCompared';

/**
 * Why a named service owes a move.
 *
 * `catchUp` is the dangerous one: the owner has already moved, so the gap exists right now.
 * `completion` is the safe one: the adapter is ready and idle, waiting on the owner.
 */
export type ObligationKind = 'catchUp' | 'completion';

export interface Obligation {
  service: string;
  topic: string;
  baselineVersion: string;
  version: string;
  kind: ObligationKind;
  /** The side this service sits on for this topic — which is what determines the verb. */
  role: OwnerSide;
  /** What this service has to do, in the imperative: `handle v2`, `produce v2`, `send v2`. */
  verb: string;
  /** The change's own verdict, carried so a surface never has to re-derive it. */
  verdict: string;
}

export interface Rollout {
  topic: string;
  version: string;
  baselineVersion: string;
  /** The version pair's `overall` verdict, unchanged from the aggregator. */
  verdict: string;
  state: RolloutState;
  ownerSide: OwnerSide | 'mixed';
  /**
   * Produced ∩ consumed = ∅ — no version anybody sends is handled by anybody.
   *
   * This is the ONLY condition under which the product may say messages are not being read. A
   * producer that declares two versions may be dual-publishing every message on both, or may be
   * running a split fleet where the new-version messages go unread, and the catalogue cannot tell
   * those apart. When the sets are disjoint no dual-publish story rescues it.
   */
  disjoint: boolean;
  /**
   * The adapter declares the baseline AND the current version — an overlap window.
   *
   * This is the escape hatch, and it is what turns two locked deploys into two independent ones. A
   * breaking change with an overlap retained requires no coordination at all, however brutal the
   * schema diff, and the product has to say so: without this flag the team that did the hard thing
   * properly sees the reddest row on the page.
   */
  overlapRetained: boolean;
  /** Services declaring the current version. Rendered plainly — doing the work is not a defect. */
  moved: string[];
  /** Services declaring the baseline and not the current, in the role that has to move. */
  outstanding: string[];
  obligations: Obligation[];
  /** The ordering constraint between the two ends, or null when there is nothing to order. */
  constraint: string | null;
  /**
   * The categorical claim, present only when `disjoint`. Kept separate from `constraint` so a
   * surface can render the ordering without inheriting the stronger statement.
   */
  disjointNote: string | null;
  /** Which side has no in-estate service at any version, when `state` is `unattributable`. */
  unattributableSide: OwnerSide | null;
  /**
   * The pair carries changes on both an event and a request/response, so the two directions
   * disagree about which side owns the shape and no single ordering can be stated.
   */
  mixedDirections: boolean;
}

/**
 * Which side owns the shape, from the change's own `direction` — already on every change.
 *
 * The asymmetry is the whole model, and it is counter-intuitive enough that it has to be computed
 * rather than read off the screen: a handler owns the shape of what it accepts AND of what it
 * answers, so on a request or a response it is the CALLER that adapts. Only on an event does the
 * handler adapt. Mesh's `producers` / `consumers` therefore do not map onto owner / adapter, which
 * is exactly why reading the two panels by eye gets it backwards.
 */
function ownerSideFor(directions: Set<string>): OwnerSide | 'mixed' {
  const handlerOwned = directions.has('request') || directions.has('response');
  const emitterOwned = directions.has('event');
  if (handlerOwned && emitterOwned) return 'mixed';
  if (emitterOwned) return 'producers';
  // Default to handler-owned. A pair with no directions at all (an unclassified or not-compared
  // comparison) never reaches an ordering sentence, so the default is not load-bearing there.
  return 'consumers';
}

const servicesOn = (entry: TopicsTopicsItem | undefined, side: OwnerSide): string[] =>
  [...new Set((side === 'producers' ? entry?.producers : entry?.consumers)?.map((p) => p.service) ?? [])].sort();

/** `handle` / `produce` / `send`, in the three grammatical forms the constraint sentences need. */
interface Verb { imperative: string; third: string; gerund: string }

/**
 * Consumers always "handle". Producers "produce" when they own the shape (they are emitting an
 * event) and "send" when they are adapting to somebody else's handler.
 */
function verbFor(side: OwnerSide, ownerSide: OwnerSide | 'mixed'): Verb {
  if (side === 'consumers') return { imperative: 'handle', third: 'handles', gerund: 'handling' };
  return ownerSide === 'producers'
    ? { imperative: 'produce', third: 'produces', gerund: 'producing' }
    : { imperative: 'send', third: 'sends', gerund: 'sending' };
}

const other = (side: OwnerSide): OwnerSide => (side === 'producers' ? 'consumers' : 'producers');

const list = (services: string[]): string => {
  if (services.length <= 1) return services[0] ?? '';
  return `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`;
};

/**
 * Every version pair in the estate that has a comparison, as a rollout.
 *
 * One row per `(topic, baseline → current)`, which is the grain at which a deployment is owed. The
 * field-level ledger keeps its own grain; a change is a field and a rollout is a topic, and
 * collapsing them is how a reader ends up counting three chips for one deploy.
 */
export function buildRollouts(
  topics: TopicsTopicsItem[],
  versionCompatibility: TopicsVersionCompatibilityItem[],
): Rollout[] {
  const byTopic = new Map<string, TopicsTopicsItem[]>();
  for (const entry of topics) {
    if (entry.reserved) continue;
    const bucket = byTopic.get(entry.topic);
    if (bucket) bucket.push(entry);
    else byTopic.set(entry.topic, [entry]);
  }
  const skew = new Map(versionCompatibility.map((v) => [v.topic, v]));

  const rollouts: Rollout[] = [];
  for (const [topic, entries] of byTopic) {
    for (const entry of entries) {
      const compatibility = entry.compatibility;
      const baselineVersion = compatibility?.baselineVersion;
      if (!compatibility || !baselineVersion) continue;

      const baseline = entries.find((e) => e.version === baselineVersion);
      const directions = new Set(compatibility.changes.map((c) => c.direction));
      const ownerSide = ownerSideFor(directions);
      // On a mixed pair neither side can be called the owner, so both are examined for obligations
      // and no ordering is stated. Picking one would be a guess in the one place a guess is an outage.
      const owner: OwnerSide = ownerSide === 'mixed' ? 'consumers' : ownerSide;
      const adapter = other(owner);

      const ownerAtCurrent = servicesOn(entry, owner);
      const ownerAtBaseline = servicesOn(baseline, owner);
      const adapterAtCurrent = servicesOn(entry, adapter);
      const adapterAtBaseline = servicesOn(baseline, adapter);

      // "No in-estate service at any version" is about the whole topic, not this pair: a side with a
      // service on some third version is still attributable, it just is not on either of these two.
      const allOn = (side: OwnerSide) =>
        [...new Set(entries.flatMap((e) => servicesOn(e, side)))];
      const ownerAbsent = allOn(owner).length === 0;
      const adapterAbsent = allOn(adapter).length === 0;

      const skewRow = skew.get(topic);
      const produced = skewRow?.producedVersions ?? [];
      const consumed = skewRow?.consumedVersions ?? [];
      const disjoint = produced.length > 0 && consumed.length > 0
        && !produced.some((v) => consumed.includes(v));

      // Whoever has to adapt still declaring the baseline alongside the current version IS the
      // overlap window. Read off the adapter because the adapter is the side that would break.
      const overlapRetained = adapterAtCurrent.length > 0
        && adapterAtBaseline.some((s) => adapterAtCurrent.includes(s));

      const outstandingAdapters = adapterAtBaseline.filter((s) => !adapterAtCurrent.includes(s));
      const outstandingOwners = ownerAtBaseline.filter((s) => !ownerAtCurrent.includes(s));

      // Order matters. `unattributable` is checked LAST, not first: a side being invisible only
      // decides the state when there is nobody to name anyway. An obligation mesh can attribute is
      // still worth stating even if the far end is a browser or a partner — and conversely, calling
      // a pair `complete` when one of its sides has no in-estate service at all would be absence
      // rendered as good news, which is the defect this product spent two waves removing.
      let state: RolloutState;
      if (compatibility.overall === 'notCompared') state = 'notCompared';
      else if (outstandingAdapters.length > 0) state = 'awaitingAdapter';
      else if (outstandingOwners.length > 0) state = 'awaitingOwner';
      else if (ownerAbsent || adapterAbsent) state = 'unattributable';
      else state = 'complete';

      const ownerVerb = verbFor(owner, ownerSide);
      const adapterVerb = verbFor(adapter, ownerSide);

      const obligations: Obligation[] = [];
      const owe = (services: string[], role: OwnerSide, kind: ObligationKind, verb: Verb) => {
        for (const service of services) {
          obligations.push({
            service, topic, baselineVersion, version: entry.version, kind, role,
            verb: `${verb.imperative} ${entry.version}`,
            verdict: compatibility.overall,
          });
        }
      };
      if (state === 'awaitingAdapter') owe(outstandingAdapters, adapter, 'catchUp', adapterVerb);
      if (state === 'awaitingOwner') owe(outstandingOwners, owner, 'completion', ownerVerb);
      // A mixed pair can owe on both sides at once, and suppressing one of them would hide a deploy.
      if (ownerSide === 'mixed' && state === 'awaitingAdapter' && outstandingOwners.length > 0) {
        owe(outstandingOwners, owner, 'completion', ownerVerb);
      }

      let constraint: string | null = null;
      if (ownerSide !== 'mixed' && state === 'awaitingAdapter') {
        constraint = `${list(outstandingAdapters)} must ${adapterVerb.imperative} ${topic} `
          + `${entry.version} before ${list(ownerAtCurrent)} stops ${ownerVerb.gerund} ${baselineVersion}. `
          + `${list(ownerAtCurrent)} already ${ownerVerb.third} ${entry.version}.`;
      } else if (ownerSide !== 'mixed' && state === 'awaitingOwner') {
        constraint = `${list(adapterAtCurrent)} already ${adapterVerb.third} ${topic} ${entry.version}, `
          + `so ${list(outstandingOwners)} can move whenever it is ready.`;
      }

      rollouts.push({
        topic,
        version: entry.version,
        baselineVersion,
        verdict: compatibility.overall,
        state,
        ownerSide,
        disjoint,
        overlapRetained,
        moved: [...new Set([...ownerAtCurrent, ...adapterAtCurrent])].sort(),
        outstanding: [...new Set(obligations.map((o) => o.service))].sort(),
        obligations,
        constraint,
        disjointNote: disjoint
          ? `No version of ${topic} produced in this estate is handled in this estate.`
          : null,
        unattributableSide: state === 'unattributable' ? (ownerAbsent ? owner : adapter) : null,
        mixedDirections: ownerSide === 'mixed',
      });
    }
  }

  return rollouts.sort(rank);
}

/**
 * Worst first, where "worst" is the join and not the verdict.
 *
 * A breaking change that has been versioned out ranks BELOW a compatible change with an outstanding
 * completion, because the first needs nobody to do anything and the second is an unfinished
 * migration. Ranking on the verdict alone is what puts the estate's best-engineered topic at the top
 * of the page.
 */
export function rank(a: Rollout, b: Rollout): number {
  return severity(a) - severity(b) || a.topic.localeCompare(b.topic) || a.version.localeCompare(b.version);
}

function severity(r: Rollout): number {
  if (r.disjoint) return 0;
  if (r.state === 'awaitingAdapter') return r.verdict === 'breaking' ? 1 : r.verdict === 'warning' ? 2 : 3;
  if (r.state === 'awaitingOwner') return 4;
  if (r.state === 'unattributable') return 5;
  if (r.state === 'notCompared') return 6;
  return 7;
}
