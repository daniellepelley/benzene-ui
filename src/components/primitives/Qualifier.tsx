import type { ReactNode } from 'react';

/**
 * The three things that sit beside a measurement, each with its own look.
 *
 * A measurement row used to render every one of them as an identical neutral chip, so
 * `18.0% of calls failed` (an alarm), `error rate not reported` (an absence) and
 * `measured by tempo` (provenance) were pixel-identical. Worse, the first two came out of the SAME
 * element — one chip that rendered an alarm or an absence depending on the data. A reader
 * screenshotting the card could not tell the alarming fact from the caveat, and the uniformity
 * itself was the lie.
 *
 * `Measurement` stays a `Chip` — it is a value. These three are not values:
 *
 * - `Alarm` — a measured fact that is bad news. Carries a tone, and is the only one of the three
 *   that may take a status colour.
 * - `Absent` — the product did not measure it. Never a zero, never a colour; it is the third state
 *   (R1), and it must not look like a small bad number.
 * - `Provenance` — which feed said so, over what window. Subordinate to everything, never pilled:
 *   it is the footnote, and a pill made it the equal of the number it annotates.
 */
export function Alarm({ children, severe = false }: { children: ReactNode; severe?: boolean }) {
  return (
    <span className="bz-qualifier" data-kind="alarm" data-severe={severe ? 'true' : undefined}>
      {children}
    </span>
  );
}

export function Absent({ children }: { children: ReactNode }) {
  return <span className="bz-qualifier" data-kind="absent">{children}</span>;
}

export function Provenance({ children }: { children: ReactNode }) {
  return <span className="bz-provenance">{children}</span>;
}
