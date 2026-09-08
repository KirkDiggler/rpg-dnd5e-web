/**
 * Money display formatting. The toolkit's wire format is copper-only
 * (rpg-toolkit#1534's `currency.Money.Breakdown` would go on to split
 * platinum/gold/electrum/silver/copper), but web deliberately stops at
 * gold as the top denomination for now rather than mirroring that all
 * the way through — platinum reads as an unfamiliar unit to most players
 * and folding it into gold keeps the display simpler. Each remainder is
 * carried down the chain (100/50/10/1 copper respectively) so the amount
 * still reads the way a coin purse actually would.
 */

const DENOMINATIONS: Array<{ label: string; copperPer: number }> = [
  { label: 'gp', copperPer: 100 },
  { label: 'ep', copperPer: 50 },
  { label: 'sp', copperPer: 10 },
  { label: 'cp', copperPer: 1 },
];

/** "15 gp", "12 gp 4 sp 7 cp", "0 cp" for a zero amount. */
export function formatMoney(copper: number): string {
  let remaining = copper;
  const parts: string[] = [];

  for (const { label, copperPer } of DENOMINATIONS) {
    const amount = Math.floor(remaining / copperPer);
    remaining -= amount * copperPer;
    if (amount > 0) {
      parts.push(`${amount} ${label}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0 cp';
}
