import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useRef, useState } from 'react';
import { sessionClient } from './client';

/** Poll the latest aim while moving; retain the last completed preview until
 * its replacement arrives. Cast still revalidates the exact click position.
 * Selection/revision changes revoke highlights immediately; older requests
 * cannot overwrite a newer preview. */
export function useSessionCastAim(
  session: string,
  member: string,
  declaration: string | undefined,
  cell: { x: number; y: number } | null,
  declarations: readonly Declaration[]
) {
  const key = JSON.stringify([session, member, declaration]);
  const latestCell = useRef(cell);
  latestCell.current = cell;
  const [result, setResult] = useState<{
    key: string;
    revision: readonly Declaration[];
    members: string[];
  } | null>(null);
  useEffect(() => {
    if (!declaration) return;
    let current = true;
    let generation = 0;
    let lastAim = '';
    let pending = false;
    let controller: AbortController | undefined;
    const read = () => {
      if (pending) return;
      const aim = latestCell.current;
      if (!aim) return;
      const { x, y } = aim;
      const aimKey = JSON.stringify([x, y]);
      if (aimKey === lastAim) return;
      lastAim = aimKey;
      pending = true;
      const request = ++generation;
      controller = new AbortController();
      void sessionClient
        .afford(
          { session, member, castAim: { declaration, cell: { x, y } } },
          { signal: controller.signal }
        )
        .then((response) => {
          if (!current || request !== generation) return;
          const preview = response.castAim;
          const echo = preview?.aim;
          const matches =
            echo?.declaration === declaration &&
            echo.cell?.x === x &&
            echo.cell?.y === y;
          setResult({
            key,
            revision: declarations,
            members:
              matches && preview?.available ? preview.affectedMembers : [],
          });
        })
        .catch(() => {
          if (current && request === generation) {
            lastAim = '';
            setResult({ key, revision: declarations, members: [] });
          }
        })
        .finally(() => {
          pending = false;
        });
    };
    const timer = setInterval(read, 80);
    return () => {
      current = false;
      clearInterval(timer);
      controller?.abort();
    };
  }, [session, member, declaration, key, declarations]);
  return cell && result?.key === key && result.revision === declarations
    ? result.members
    : [];
}
