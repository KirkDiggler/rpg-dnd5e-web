import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useState } from 'react';
import { sessionClient } from './client';

/** Read-only provider preview. Stale or failed replies never supply highlights. */
export function useSessionCastAim(
  session: string,
  member: string,
  declaration: string | undefined,
  cell: { x: number; y: number } | null,
  declarations: readonly Declaration[]
) {
  const x = cell?.x;
  const y = cell?.y;
  const key = JSON.stringify([session, member, declaration, x, y]);
  const [result, setResult] = useState<{
    key: string;
    revision: readonly Declaration[];
    members: string[];
  } | null>(null);
  useEffect(() => {
    if (!declaration || x === undefined || y === undefined) return;
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void sessionClient
        .afford(
          { session, member, castAim: { declaration, cell: { x, y } } },
          { signal: controller.signal }
        )
        .then((response) => {
          if (!current) return;
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
          if (current) setResult({ key, revision: declarations, members: [] });
        });
    }, 80);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, member, declaration, x, y, key, declarations]);
  return result?.key === key && result.revision === declarations
    ? result.members
    : [];
}
