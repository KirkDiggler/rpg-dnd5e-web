/**
 * THE KEPT READ-BACK BELONGS TO ITS DRAFT (rpg-project#968, R25). The last
 * sentences that compiled are kept while a draft is refused, but only for
 * that draft: another file opened into the same studio never shows them.
 */
import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  PutDungeonResponseSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from '../encounter-studio/draftFile';
import { castleEngineReadBack } from '../encounter-studio/fixtures/engineReadBack';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import type { RoomDraft } from './roomDraft';
import type { SiteScope } from './siteScope';
import { useRoomPublishing } from './useRoomPublishing';

const read = readDraftYaml(served);
if (!read.ok) throw new Error(read.refusal);
const castle = read.draft;
/** Another file with the castle's ids (a copy), as its own room. */
const copy: RoomDraft = { ...castle, id: 'another-room', name: 'Another' };

describe('useRoomPublishing: the read-back is the draft’s own', () => {
  it('a second draft whose first check is refused shows none of the first draft’s sentences', async () => {
    const putDungeon = vi
      .fn()
      .mockResolvedValueOnce(
        create(PutDungeonResponseSchema, { readBack: castleEngineReadBack() })
      )
      .mockResolvedValue(
        create(PutDungeonResponseSchema, {
          errors: [create(FieldErrorSchema, { path: 'x', message: 'no' })],
        })
      );
    const client = { putDungeon } as never;
    const capability = { characterId: null, onPlay: () => {} };
    const { result, rerender } = renderHook(
      ({ draft }: { draft: RoomDraft }) =>
        useRoomPublishing({
          draft,
          scope: read.scope as SiteScope,
          capability,
          client,
          onImportDraft: () => true,
        }),
      { initialProps: { draft: castle } }
    );
    await waitFor(() => expect(result.current.readBack).not.toBeNull(), {
      timeout: 3000,
    });
    expect(result.current.readBackIsCurrent).toBe(true);

    rerender({ draft: copy });
    await waitFor(() => expect(result.current.preview.status).toBe('errors'), {
      timeout: 3000,
    });
    expect(result.current.readBack).toBeNull();
    expect(result.current.readBackIsCurrent).toBe(false);

    // Back to the first draft, still refused: its own last sentences are
    // not resurrected either, since they were dropped with the switch.
    rerender({ draft: castle });
    expect(result.current.readBack).toBeNull();
  });
});
