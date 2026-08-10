import type { Theme } from '../../store/slices/viewSlice';

export interface ThemeToggleProps {
  theme: Theme;
  onCycle: () => void;
}

const GLYPH: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };
const LABEL: Record<Theme, string> = {
  system: 'Theme: following your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/**
 * Light, dark, or whatever the machine says.
 *
 * A three-state cycle rather than a two-state switch, because "follow the system" is a real answer
 * and the common one — a two-state switch has to pick a side on first paint and thereby overrides a
 * preference the reader already expressed to their OS. The current state is in the label, not only
 * in the glyph: a moon could mean "dark is on" or "click for dark", and a control whose meaning is
 * ambiguous gets clicked twice.
 */
export function ThemeToggle({ theme, onCycle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="bz-theme-toggle"
      onClick={onCycle}
      title={`${LABEL[theme]}. Click to change.`}
      aria-label={LABEL[theme]}
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
    </button>
  );
}
