import { characterClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import type { ListSpellsByLevelRequest } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ListSpellsByLevelRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback } from 'react';

export function useCharacterService() {
  const listSpellsByLevel = useCallback(
    async (request: Partial<ListSpellsByLevelRequest>) => {
      try {
        const req = create(ListSpellsByLevelRequestSchema, {
          level: request.level ?? 0,
          class: request.class,
          pageSize: request.pageSize ?? 100,
          pageToken: request.pageToken ?? '',
        });

        const response = await characterClient.listSpellsByLevel(req);
        return response;
      } catch (error) {
        console.error('Failed to list spells by level:', error);
        throw error;
      }
    },
    []
  );

  return {
    listSpellsByLevel,
  };
}
