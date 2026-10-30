/**
 * The engine's sentences at a row, and the row's answer to a jump
 * (rpg-project#720, R17). See [rowRefusals].
 */
import type { RowRefusal } from './rowRefusals';

export function RowRefusalLines({
  refusals,
}: {
  refusals: readonly RowRefusal[];
}) {
  if (refusals.length === 0) return null;
  return (
    <>
      {refusals.map((r, index) => (
        <p
          key={`${r.path}:${index}`}
          className="wb-entry-refusal"
          role="alert"
          title={r.path}
          data-testid="row-refusal"
        >
          {r.message}
        </p>
      ))}
    </>
  );
}
