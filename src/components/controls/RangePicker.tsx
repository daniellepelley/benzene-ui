export interface RangeOption {
  ms: number;
  label: string;
}

export interface RangePickerProps {
  rangeMs: number;
  options: RangeOption[];
  onChange?: (ms: number) => void;
  /** Hidden entirely when there is no live plane — a window over nothing is a control that lies. */
  available?: boolean;
}

/**
 * The window the live plane reports over.
 *
 * Every live figure on the page is qualified by this, which is why it lives beside them rather than
 * in a settings panel: a reader who cannot see the window while reading the number has no way to
 * know what the number means.
 */
export function RangePicker({ rangeMs, options, onChange, available = true }: RangePickerProps) {
  if (!available) return null;

  return (
    <label className="bz-range">
      <span className="bz-range-label">Live window</span>
      <select
        value={rangeMs}
        onChange={(e) => onChange?.(Number(e.target.value))}
        aria-label="Live window"
      >
        {options.map((o) => (
          <option key={o.ms} value={o.ms}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
