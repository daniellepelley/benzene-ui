import type { TopicsTopicsItemCompatibility } from '../../contracts';
import { StatusGlyph } from '../primitives/StatusGlyph';
import {
  NOT_COMPARED_COPY, NOT_COMPARED_FALLBACK, NOT_PUBLISHED_COPY, SCOPE_CAVEAT,
  VERDICT_ATTRIBUTION, VERDICT_LABEL, notComparedSideCopy,
} from './compatibilityCopy';

export interface ContractChangesProps {
  compatibility: TopicsTopicsItemCompatibility | null;
  /** False when this estate's aggregator publishes no comparisons at all — a fact about the tool. */
  published: boolean;
  version: string;
}

const RAG: Record<string, 'red' | 'amber' | 'green' | undefined> = {
  breaking: 'red',
  warning: 'amber',
  compatible: 'green',
  notCompared: undefined,
};

/**
 * A verdict badge. The attribution is part of the badge rather than an optional extra, because
 * `SchemaCompatibilityRules` is configurable and ships a `Strict()` alternative — the verdict is a
 * function of a rule table, not a fact about the world. Saying so converts an argument into a setting.
 *
 * `baseline` names the verdict's SUBJECT, and a surface that knows it should pass it. The rule table
 * answers exactly one question — *does this version break a reader still on the previous one?* — and
 * a bare `compatible` reads as "nothing to do here", which is false often enough to matter: an
 * additive required field on an event is genuinely compatible for a v1 reader AND still leaves the
 * producer a deploy to make. Naming the reader is what keeps the verdict true and stops it being
 * mistaken for a statement about whether any work is outstanding.
 */
export function VerdictBadge(
  { verdict, attribute = true, baseline }:
  { verdict: string; attribute?: boolean; baseline?: string | null },
) {
  const rag = RAG[verdict];
  return (
    <span className="bz-verdict" data-verdict={verdict}>
      {rag && rag !== 'green' && <StatusGlyph rag={rag} label={`${VERDICT_LABEL[verdict]}: attention`} />}
      {VERDICT_LABEL[verdict] ?? verdict}
      {baseline && verdict !== 'notCompared' && (
        <span className="bz-verdict-subject">for readers still on {baseline}</span>
      )}
      {attribute && verdict !== 'notCompared' && (
        <span className="bz-verdict-attr">{VERDICT_ATTRIBUTION}</span>
      )}
    </span>
  );
}

/**
 * Drops the `topic.side.` prefix, which is identical on every row here and so carries no information.
 * The full path stays available as the element's title, so it remains copyable into a ticket.
 */
export function shortPath(path: string): string {
  const parts = path.split('.');
  return parts.length > 2 ? parts.slice(2).join('.') : path;
}

/**
 * What changed between this version of a topic's contract and the one published before it.
 *
 * Ordered deliberately: the CLASSIFICATION leads (which named field, which side, added / removed /
 * renamed / retyped) and the verdict follows, attributed. Eight user roles agreed on the
 * classification and gave six non-nesting definitions of "breaking" — the two changes the rule table
 * ranks lowest were the two that most alarmed a business analyst and a security reviewer. So the
 * layer every role can reason from goes first, and the scalar verdict is a convenience on top of it
 * rather than the answer.
 *
 * Every "nothing to report" path here is a *stated* outcome. No branch renders silence, because
 * silence is what a reader reads as an all-clear.
 */
export function ContractChanges({ compatibility, published, version }: ContractChangesProps) {
  // A capability statement about the tool outranks a content statement about the estate. If this
  // aggregator publishes no comparisons, saying anything about versions here would be a claim about
  // the reader's architecture that this product is in no position to make.
  if (!published) {
    return (
      <div className="bz-changes-section">
        <h4>Against the previous version</h4>
        <p className="bz-muted">{NOT_PUBLISHED_COPY}</p>
      </div>
    );
  }

  if (!compatibility) return null;

  const { overall, changes, baselineVersion, notComparedReason, notComparedSides, truncatedPaths } =
    compatibility;

  if (overall === 'notCompared') {
    return (
      <div className="bz-changes-section" data-verdict="notCompared">
        <h4>Against the previous version</h4>
        <p className="bz-muted">
          {(notComparedReason && NOT_COMPARED_COPY[notComparedReason]) ?? NOT_COMPARED_FALLBACK}
        </p>
      </div>
    );
  }

  const counts = changes.reduce<Record<string, number>>(
    (acc, change) => ({ ...acc, [change.compatibility]: (acc[change.compatibility] ?? 0) + 1 }),
    {},
  );

  return (
    <div className="bz-changes-section" data-verdict={overall}>
      <h4>Against {baselineVersion || 'the previous version'}</h4>

      <p className="bz-changes-summary">
        <VerdictBadge verdict={overall} baseline={baselineVersion} />
        {['breaking', 'warning', 'compatible'].map((verdict) =>
          counts[verdict] ? (
            <span key={verdict} className="bz-changes-count" data-verdict={verdict}>
              {counts[verdict]} {VERDICT_LABEL[verdict]}
            </span>
          ) : null,
        )}
      </p>

      {changes.length === 0 ? (
        <p className="bz-muted">
          No field-level difference was detected between {baselineVersion} and{' '}
          {version || 'this version'}.
        </p>
      ) : (
        <ul className="bz-changes-list">
          {changes.map((change) => (
            <li
              key={`${change.path}:${change.kind}`}
              className="bz-change"
              data-verdict={change.compatibility}
            >
              <VerdictBadge verdict={change.compatibility} attribute={false} />
              <span className="bz-change-side">{change.direction}</span>
              <code className="bz-change-path" title={change.path}>{shortPath(change.path)}</code>
              <span className="bz-change-desc">{change.description}</span>
            </li>
          ))}
        </ul>
      )}

      {notComparedSides.length > 0 && (
        <p className="bz-muted">{notComparedSideCopy(notComparedSides, baselineVersion)}</p>
      )}

      {truncatedPaths.length > 0 && (
        <p className="bz-muted">
          A type changed at {truncatedPaths.map(shortPath).join(', ')}, so fields beneath were not
          compared — the counts above are a floor, not a total.
        </p>
      )}

      <p className="bz-muted bz-changes-caveat">{SCOPE_CAVEAT}</p>
    </div>
  );
}
