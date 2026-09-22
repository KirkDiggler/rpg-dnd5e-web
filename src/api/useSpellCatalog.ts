import type { SpellInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { characterClient } from './client';

const emptyCatalog: ReadonlyMap<string, SpellInfo> = new Map();
let pending: Promise<ReadonlyMap<string, SpellInfo>> | undefined;

// Public catalog metadata, shared by choices and owned spell lists. Eligibility
// and cast availability still come from their own provider declarations.
function loadCatalog() {
  pending ??= Promise.resolve()
    .then(() =>
      Promise.all(
        [0, 1].map((level) => characterClient.listSpellsByLevel({ level }))
      )
    )
    .then(
      (responses) =>
        new Map(
          responses
            .flatMap((response) => response.spells)
            .filter((spell) => spell.spellRef)
            .map((spell) => [spell.spellRef, spell] as const)
        )
    )
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

export function useSpellCatalog(enabled = true) {
  const [catalog, setCatalog] = useState(emptyCatalog);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // A failed catalog read must not invent implementation or cast status.
    void loadCatalog()
      .then((value) => {
        if (active) setCatalog(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);
  return catalog;
}
