import type { Rag } from '../../contracts';
import { StatusGlyph } from '../primitives/StatusGlyph';

export interface EstateStat {
  key: string;
  value: number;
  label: string;
  /** Colours the figure, and adds a glyph — colour is never the only signal. */
  rag?: Rag;
  /**
   * Where this number leads. A tile WITH one renders as a real button; a tile without stays inert
   * and gains no hover, cursor or focus affordance, so no tile is ever falsely clickable.
   *
   * This exists because the reverse defect is worse: a drift badge that changed the cursor and did
   * nothing had readers clicking it repeatedly, assuming they had missed something. A number that
   * reports a problem and cannot be followed is where triage stops.
   */
  onClick?: () => void;
  /**
   * Shown instead of the figure when the number could not be computed — not the same as zero. A `0`
   * on an uncomputed count is the "absence rendered as good news" defect landing on the one question
   * the reader came to ask.
   */
  placeholder?: string;
  /** Extra clause after the label, e.g. "not computed". */
  note?: string;
}

export interface EstateStatsProps {
  stats: EstateStat[];
}

/**
 * The estate in five numbers.
 *
 * This is the page's answer to "is anything wrong, and where", and it has to land in the first
 * second — which means it has to be the largest thing on the page. The version this replaces said
 * the same facts in a sentence of body text, so a reader had to *read* to discover the estate was
 * broken. A number at 23px in tabular figures is read before it is read.
 *
 * A zero count keeps the default colour: a red "0 unreachable" is noise, and noise in the place
 * alarms live is how alarms get ignored.
 */
export function EstateStats({ stats }: EstateStatsProps) {
  return (
    <div className="bz-stats">
      {stats.map((stat) => {
        const rag = stat.value > 0 ? stat.rag : undefined;
        const body = (
          <>
            <span className="bz-stat-n">{stat.placeholder ?? stat.value.toLocaleString()}</span>
            <span className="bz-stat-l">
              {rag && rag !== 'green' && <StatusGlyph rag={rag} label={`${stat.label}: attention`} />}
              {stat.label}
              {stat.note && <span className="bz-stat-note">{stat.note}</span>}
            </span>
          </>
        );

        return stat.onClick ? (
          <button type="button" className="bz-stat" key={stat.key} data-rag={rag} onClick={stat.onClick}>
            {body}
          </button>
        ) : (
          <div className="bz-stat" key={stat.key} data-rag={rag}>{body}</div>
        );
      })}
    </div>
  );
}
