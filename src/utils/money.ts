/**
 * Money display formatting — mirrors the toolkit's
 * `currency.Money.Breakdown` exactly (rpg-toolkit#1534): copper is the
 * wire's one denomination, and a display splits it greedily into
 * platinum/gold/electrum/silver/copper, largest first, each remainder
 * carried down the chain (1000/100/50/10/1 copper respectively) so the
 * amount reads the way a coin purse actually would.
 */

const DENOMINATIONS: Array<{ label: string; copperPer: number }> = [
  { label: 'pp', copperPer: 1000 },
  { label: 'gp', copperPer: 100 },
  { label: 'ep', copperPer: 50 },
  { label: 'sp', copperPer: 10 },
  { label: 'cp', copperPer: 1 },
];

/** "15 gp", "1 pp 2 gp 4 sp 7 cp", "0 cp" for a zero amount. */
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
