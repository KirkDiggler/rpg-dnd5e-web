import { create } from '@bufbuild/protobuf';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  AppearanceSchema,
  CharacterDraftSchema,
  CreateDraftResponseSchema,
  UpdateAppearanceResponseSchema,
  type Appearance,
  type CharacterDraft,
  type UpdateAppearanceResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { act, render } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterDraftProvider } from './CharacterDraftContext';
import {
  CharacterDraftContext,
  type CharacterDraftState,
} from './CharacterDraftContextDef';

const api = vi.hoisted(() => ({
  createDraft: vi.fn(),
  updateAppearance: vi.fn(),
  noop: vi.fn(),
  emptyList: [] as never[],
}));

vi.mock('../../api/client', () => ({
  characterClient: { getDraft: vi.fn() },
}));

vi.mock('../../api/hooks', () => ({
  useCreateDraft: () => ({ createDraft: api.createDraft }),
  useFinalizeDraft: () => ({ finalizeDraft: api.noop }),
  useListBackgrounds: () => ({ data: api.emptyList }),
  useListClasses: () => ({ data: api.emptyList }),
  useListRaces: () => ({ data: api.emptyList }),
  useUpdateDraftAbilityScores: () => ({ updateAbilityScores: api.noop }),
  useUpdateDraftAppearance: () => ({
    updateAppearance: api.updateAppearance,
  }),
  useUpdateDraftBackground: () => ({ updateBackground: api.noop }),
  useUpdateDraftClass: () => ({ updateClass: api.noop }),
  useUpdateDraftName: () => ({ updateName: api.noop }),
  useUpdateDraftRace: () => ({ updateRace: api.noop }),
}));

let current: CharacterDraftState | null = null;

function Probe() {
  current = useContext(CharacterDraftContext);
  return null;
}

function renderProvider() {
  render(
    <CharacterDraftProvider>
      <Probe />
    </CharacterDraftProvider>
  );
}

function appearance(colorSrgb: number, roughness: number): Appearance {
  return create(AppearanceSchema, {
    hair: create(HairCustomizationSchema, {
      scalp: create(StyleSelectionSchema, {
        selection: {
          case: 'styleRef',
          value: 'modular-fantasy-hero:hair:38',
        },
      }),
      colorSrgb,
      roughness,
    }),
  });
}

function draft(id: string, hairColor: number): CharacterDraft {
  return create(CharacterDraftSchema, {
    id,
    name: `Draft ${hairColor}`,
    appearance: appearance(hairColor, 0.5),
  });
}

async function loadInitial(initial: CharacterDraft) {
  api.createDraft.mockResolvedValue(
    create(CreateDraftResponseSchema, { draft: initial })
  );
  await act(async () => {
    await current!.createDraft('player-1');
  });
}

function deferredResponse() {
  let resolve!: (response: UpdateAppearanceResponse) => void;
  const promise = new Promise<UpdateAppearanceResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  current = null;
  api.createDraft.mockReset();
  api.updateAppearance.mockReset();
  api.noop.mockReset();
});

describe('CharacterDraftContext updateAppearance response authority', () => {
  it('keeps the prior draft while pending, then replaces it with and returns the response draft', async () => {
    const initial = draft('draft-1', 0x111111);
    const serverDraft = draft('draft-1', 0xabcdef);
    const requestAppearance = appearance(0, 0);
    const pending = deferredResponse();
    api.updateAppearance.mockReturnValue(pending.promise);
    renderProvider();
    await loadInitial(initial);

    let updatePromise!: Promise<CharacterDraft>;
    act(() => {
      updatePromise = current!.updateAppearance(requestAppearance);
    });

    expect(current!.draft).toBe(initial);
    expect(api.updateAppearance).toHaveBeenCalledTimes(1);
    const request = api.updateAppearance.mock.calls[0]![0];
    expect(request.draftId).toBe('draft-1');
    expect(request.appearance?.hair?.colorSrgb).toBe(0);
    expect(request.appearance?.hair?.roughness).toBe(0);

    pending.resolve(
      create(UpdateAppearanceResponseSchema, { draft: serverDraft })
    );
    let returned!: CharacterDraft;
    await act(async () => {
      returned = await updatePromise;
    });

    expect(returned).toBe(serverDraft);
    expect(current!.draft).toBe(serverDraft);
  });

  it('retains the prior draft and propagates the RPC rejection', async () => {
    const initial = draft('draft-2', 0x222222);
    const failure = new Error('update rejected');
    api.updateAppearance.mockRejectedValue(failure);
    renderProvider();
    await loadInitial(initial);

    let caught: unknown;
    await act(async () => {
      try {
        await current!.updateAppearance(appearance(0x333333, 0.3));
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(failure);
    expect(current!.draft).toBe(initial);
    expect(current!.error).toBe(failure);
  });

  it('rejects without an RPC or local mutation when no persisted draft ID exists', async () => {
    renderProvider();

    let caught: unknown;
    await act(async () => {
      try {
        await current!.updateAppearance(appearance(0, 0));
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toEqual(
      new Error('Cannot update appearance without a draft')
    );
    expect(api.updateAppearance).not.toHaveBeenCalled();
    expect(current!.draft).toBeNull();
  });
});
