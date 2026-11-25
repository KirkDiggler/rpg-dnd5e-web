import { useContext } from 'react';
import { SharedLinesContext } from '../world-building/sharedLinesContext';

/**
 * The conversations a selected carrier carries, as the engine's read-back
 * says (rpg-project#1059); each opens on the Conversations page.
 */
export function CarriedConversations({
  kind,
  id,
  name,
}: {
  kind: 'creature' | 'prop' | 'faction';
  id: string;
  name: string;
}): React.JSX.Element | null {
  const { carriedBy, open } = useContext(SharedLinesContext);
  const carried = carriedBy?.(kind, id) ?? [];
  if (carried.length === 0) return null;
  return (
    <section
      className="es-carried-conversations"
      aria-label={`Conversations ${name} carries`}
    >
      <h4 className="es-section-label">Conversations</h4>
      <ul>
        {carried.map((conversation) => {
          const words = `${conversation.id} · ${conversation.lines} ${
            conversation.lines === 1 ? 'line' : 'lines'
          }`;
          return (
            <li key={conversation.id}>
              {open ? (
                <button
                  type="button"
                  aria-label={`Open ${conversation.id} in Conversations`}
                  onClick={() => open(conversation.id)}
                >
                  {words}
                </button>
              ) : (
                words
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
