import { formatStamp } from '../../store/selectors';

export interface StampProps {
  /** An ISO-8601 UTC instant from the wire. Absent or unparseable renders the third state. */
  iso: string | null | undefined;
  /** `fleet.now`, passed down — a primitive may not read the store, and none may read the clock. */
  now: number;
  /** What this moment IS. Rendered before the date, so the stamp reads as a sentence. */
  label?: string;
  /** What to say when there is no timestamp. Absent means render nothing at all. */
  absent?: string;
}

/**
 * The only way this product renders a moment.
 *
 * THE DATE/AGE RULE, at the render site: a date never appears without its age, and an age never
 * without its date. Half the surfaces printed a raw UTC string and left the reader to subtract —
 * so a 2.5-month-stale snapshot looked exactly like a fresh one while the page computed obligations
 * from it — and the other half printed a bare age, which cannot be quoted into a steering pack or
 * lined up against a deployment record.
 *
 * The age is the decision and the date is the evidence; neither is any use alone. Rendered as a
 * `<time>` so the machine-readable instant survives a copy-paste and a screen reader announces it.
 */
export function Stamp({ iso, now, label, absent }: StampProps) {
  const stamp = formatStamp(iso, now);
  if (!stamp) return absent ? <span className="bz-stamp" data-absent="">{absent}</span> : null;

  return (
    <span className="bz-stamp">
      {label && <span className="bz-stamp-label">{label} </span>}
      <time dateTime={stamp.iso} title={stamp.iso}>{stamp.date}</time>
      {/* An unticked clock is a lifecycle instant, not a measurement — so the age is omitted rather
          than computed from the store's resting zero, which would read as 56 years. */}
      {stamp.age && <span className="bz-stamp-age"> ({stamp.age})</span>}
    </span>
  );
}
