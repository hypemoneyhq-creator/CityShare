// Spec section 5's refund ladder, by minutes before scheduled departure.
// The table has a gap: it jumps from "1 to 2 hours: 50%" straight to
// "under 30 minutes: 0%" with nothing said about 30-60 minutes. There's
// no basis here to invent a fifth number, so that band is treated as the
// same 0% tier as "under 30 minutes" — the conservative reading, and
// flagged here rather than silently guessed at.
const LADDER: Array<{ minMinutesBeforeDeparture: number; refundPercent: number }> = [
  { minMinutesBeforeDeparture: 180, refundPercent: 100 },
  { minMinutesBeforeDeparture: 120, refundPercent: 80 },
  { minMinutesBeforeDeparture: 60, refundPercent: 50 },
  { minMinutesBeforeDeparture: 0, refundPercent: 0 },
];

export function refundPercentFor(minutesBeforeDeparture: number): number {
  for (const tier of LADDER) {
    if (minutesBeforeDeparture >= tier.minMinutesBeforeDeparture) return tier.refundPercent;
  }
  return 0;
}
