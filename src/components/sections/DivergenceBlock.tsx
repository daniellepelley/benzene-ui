import { StatusGlyph } from '../primitives/StatusGlyph';
import { Chip } from '../primitives/Chip';
import type { Rag } from '../../contracts';

/** One class of declared-vs-observed disagreement: what it is, who it affects, and what it means. */
export interface Divergence {
  /** Stable key, and the value the row's `data-kind` carries. */
  kind: string;
  rag: Rag;
  /** The finding, in the reader's words. Never the mechanism. */
  label: string;
  /** Why it happens and what to do — one clause, not a paragraph. */
  diagnosis: string;
  services: string[];
}

export interface DivergenceBlockProps {
  divergences: Divergence[];
  onOpenService?: (service: string) => void;
}

/**
 * Where the declared estate and the observed estate disagree — one block, one heading, one row per
 * class.
 *
 * This replaces four sibling paragraphs that were four diagnoses wearing four near-identical
 * costumes. Each was individually honest and correct; stacked, they read as one indistinct band of
 * amber prose, and a reader scanning the top of the estate page could not tell how many *different*
 * things were wrong, or which of them was theirs. Counting them is the point of the heading.
 *
 * Deliberately a shared section rather than estate-page markup: the service page carries two more
 * paragraphs of the same species (feeds the collector declares it cannot supply; the manifest and
 * the plane disagreeing on health), and they are the same grammar at a different grain.
 *
 * Identity is NEVER painted with a status colour here. The banners this replaces rendered service
 * names as amber `warn` chips, so an identity wore the same hue as a real signal directly beside it
 * — the rule is that red, amber and green mean status and nothing else.
 */
export function DivergenceBlock({ divergences, onOpenService }: DivergenceBlockProps) {
  if (divergences.length === 0) return null;

  return (
    <section className="bz-divergence-block">
      <div className="bz-section-head">
        <h2>Declared and observed disagree ({divergences.length})</h2>
      </div>
      <ul className="bz-divergence-list">
        {divergences.map((d) => (
          <li key={d.kind} className="bz-divergence-row" data-kind={d.kind}>
            <StatusGlyph rag={d.rag} label={d.label} />
            <span className="bz-divergence-label">{d.label}</span>
            <span className="bz-divergence-services">
              {d.services.map((name) => (
                onOpenService
                  ? (
                    <button key={name} type="button" className="bz-cat-svc"
                      onClick={() => onOpenService(name)}>
                      {name}
                    </button>
                  )
                  : <Chip key={name}>{name}</Chip>
              ))}
            </span>
            <span className="bz-divergence-diagnosis">{d.diagnosis}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
