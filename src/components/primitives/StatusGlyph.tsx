import type { Rag } from '../../contracts';

const GLYPH: Record<Rag, string> = { red: '▲', amber: '◆', green: '●', gone: '○' };
const LABEL: Record<Rag, string> = {
  red: 'unhealthy',
  amber: 'degraded',
  green: 'healthy',
  gone: 'unreachable',
};

export interface StatusGlyphProps {
  rag: Rag;
  /** Overrides the accessible label when the glyph means something other than service health. */
  label?: string;
}

/**
 * The RAG mark, carried over verbatim from mesh-ui.html's RAG_GLYPH so the visual language does not
 * change during the port. Shape as well as colour — colour alone is not an accessible signal.
 */
export function StatusGlyph({ rag, label }: StatusGlyphProps) {
  return (
    <span className="bz-rag" data-rag={rag} role="img" aria-label={label ?? LABEL[rag]}>
      {GLYPH[rag]}
    </span>
  );
}
