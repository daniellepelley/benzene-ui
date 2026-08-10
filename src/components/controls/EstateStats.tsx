import type { Rag } from '../../contracts';
import { StatusGlyph } from '../primitives/StatusGlyph';

export interface EstateStat {
  key: string;
  value: number;
  label: string;
  /** Colours the figure, and adds a glyph — colour is never the only signal. */
  rag?: Rag;
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
        return (
          <div className="bz-stat" key={stat.key} data-rag={rag}>
            <span className="bz-stat-n">{stat.value.toLocaleString()}</span>
            <span className="bz-stat-l">
              {rag && rag !== 'green' && <StatusGlyph rag={rag} label={`${stat.label}: attention`} />}
              {stat.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
