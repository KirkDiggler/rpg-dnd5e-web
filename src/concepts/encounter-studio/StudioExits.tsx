import type { SiteExit } from '../world-building/siteScope';
import type { RefusalTarget } from './refusalJump';

/** THE EXITS, IN WAYS OUT (rpg-project#970): each is set on its hex on the
 * map; here each is listed with a jump to that hex, beside the endings that
 * name it. */
export function StudioExits({
  exits,
  onJump,
}: {
  exits: readonly SiteExit[];
  onJump?(target: RefusalTarget): void;
}): React.JSX.Element {
  return (
    <section aria-label="Exits" className="es-exits">
      <h3>Exits</h3>
      {exits.length === 0 ? (
        <p className="es-help">
          No exits. An exit is set on its hex on the map.
        </p>
      ) : (
        <ul aria-label="Exit list">
          {exits.map((exit) => (
            <li key={exit.id} data-exit={exit.id}>
              <button
                type="button"
                className="es-link"
                aria-label={`Open exit ${exit.id} at q ${exit.cell.q}, r ${exit.cell.r}`}
                disabled={!onJump}
                onClick={() =>
                  onJump?.({ kind: 'hex', cell: { ...exit.cell } })
                }
              >
                {`${exit.id} · q ${exit.cell.q}, r ${exit.cell.r}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {exits.length > 0 && (
        <p className="es-help">An exit is set on its hex on the map.</p>
      )}
    </section>
  );
}
