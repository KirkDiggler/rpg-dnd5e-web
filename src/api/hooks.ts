import { create } from '@bufbuild/protobuf';
import type {
  BackgroundInfo,
  Character,
  CharacterDraft,
  ClassInfo,
  CreateDraftRequest,
  DeleteDraftRequest,
  Equipment,
  FinalizeDraftRequest,
  RaceInfo,
  RollAbilityScoresRequest,
  RollAbilityScoresResponse,
  UpdateAbilityScoresRequest,
  UpdateBackgroundRequest,
  UpdateClassRequest,
  UpdateNameRequest,
  UpdateRaceRequest,
  UpdateSkillsRequest,
  ValidateDraftRequest,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  DeleteCharacterRequestSchema,
  GetCharacterRequestSchema,
  GetDraftRequestSchema,
  ListBackgroundsRequestSchema,
  ListCharactersRequestSchema,
  ListClassesRequestSchema,
  ListDraftsRequestSchema,
  ListEquipmentByTypeRequestSchema,
  ListRacesRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { EquipmentType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useCallback, useEffect, useState } from 'react';
import { characterClient } from './client';

// Hook state types
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface ListState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  nextPageToken?: string;
}

// Character API hooks
export function useGetCharacter(characterId: string) {
  const [state, setState] = useState<AsyncState<Character>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchCharacter = useCallback(async () => {
    if (!characterId) {
      setState({
        data: null,
        loading: false,
        error: new Error('Character ID is required'),
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const request = create(GetCharacterRequestSchema, {
        characterId,
      });
      const response = await characterClient.getCharacter(request);
      setState({
        data: response.character || null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error:
          err instanceof Error ? err : new Error('Failed to fetch character'),
      });
    }
  }, [characterId]);

  useEffect(() => {
    void fetchCharacter();
  }, [fetchCharacter]);

  return {
    ...state,
    refetch: fetchCharacter,
  };
}

export function useListCharacters({
  playerId,
  sessionId,
  pageSize = 10,
}: {
  playerId?: string;
  sessionId?: string;
  pageSize?: number;
}) {
  const [state, setState] = useState<ListState<Character>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchCharacters = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListCharactersRequestSchema, {
          pageSize,
          pageToken: pageToken || '',
          playerId: playerId || '',
          sessionId: sessionId || '',
        });
        const response = await characterClient.listCharacters(request);
        setState({
          data: response.characters || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (err) {
        setState({
          data: [],
          loading: false,
          error:
            err instanceof Error
              ? err
              : new Error('Failed to fetch characters'),
        });
      }
    },
    [pageSize, playerId, sessionId]
  );

  useEffect(() => {
    void fetchCharacters();
  }, [fetchCharacters]);

  return {
    ...state,
    refetch: (pageToken?: string) => fetchCharacters(pageToken),
    loadMore: state.nextPageToken
      ? () => fetchCharacters(state.nextPageToken)
      : undefined,
  };
}

// Draft API hooks
export function useGetDraft(draftId: string) {
  const [state, setState] = useState<AsyncState<CharacterDraft>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchDraft = useCallback(async () => {
    if (!draftId) {
      setState({
        data: null,
        loading: false,
        error: new Error('Draft ID is required'),
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const request = create(GetDraftRequestSchema, {
        draftId,
      });
      const response = await characterClient.getDraft(request);
      setState({
        data: response.draft || null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch draft'),
      });
    }
  }, [draftId]);

  useEffect(() => {
    void fetchDraft();
  }, [fetchDraft]);

  return {
    ...state,
    refetch: fetchDraft,
  };
}

export function useListDrafts({
  playerId,
  sessionId,
  pageSize = 10,
}: {
  playerId?: string;
  sessionId?: string;
  pageSize?: number;
}) {
  const [state, setState] = useState<ListState<CharacterDraft>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchDrafts = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListDraftsRequestSchema, {
          pageSize,
          pageToken: pageToken || '',
          playerId: playerId || '',
          sessionId: sessionId || '',
        });
        const response = await characterClient.listDrafts(request);
        setState({
          data: response.drafts || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (err) {
        setState({
          data: [],
          loading: false,
          error:
            err instanceof Error ? err : new Error('Failed to fetch drafts'),
        });
      }
    },
    [pageSize, playerId, sessionId]
  );

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  return {
    ...state,
    refetch: (pageToken?: string) => fetchDrafts(pageToken),
    loadMore: state.nextPageToken
      ? () => fetchDrafts(state.nextPageToken)
      : undefined,
  };
}

// Character creation hooks
export function useCreateDraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDraft = useCallback(async (request: CreateDraftRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.createDraft(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to create draft');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createDraft, loading, error };
}

export function useUpdateDraftName() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateName = useCallback(async (request: UpdateNameRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.updateName(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to update name');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateName, loading, error };
}

export function useUpdateDraftRace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateRace = useCallback(async (request: UpdateRaceRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.updateRace(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to update race');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateRace, loading, error };
}

export function useUpdateDraftClass() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateClass = useCallback(async (request: UpdateClassRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.updateClass(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to update class');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateClass, loading, error };
}

export function useUpdateDraftBackground() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateBackground = useCallback(
    async (request: UpdateBackgroundRequest) => {
      setLoading(true);
      setError(null);
      try {
        const response = await characterClient.updateBackground(request);
        return response;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to update background');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateBackground, loading, error };
}

export function useUpdateDraftAbilityScores() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateAbilityScores = useCallback(
    async (request: UpdateAbilityScoresRequest) => {
      setLoading(true);
      setError(null);
      try {
        const response = await characterClient.updateAbilityScores(request);
        return response;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error('Failed to update ability scores');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateAbilityScores, loading, error };
}

export function useUpdateDraftSkills() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateSkills = useCallback(async (request: UpdateSkillsRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.updateSkills(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to update skills');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateSkills, loading, error };
}

export function useValidateDraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const validateDraft = useCallback(async (request: ValidateDraftRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.validateDraft(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to validate draft');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { validateDraft, loading, error };
}

export function useFinalizeDraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const finalizeDraft = useCallback(async (request: FinalizeDraftRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.finalizeDraft(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to finalize draft');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { finalizeDraft, loading, error };
}

export function useDeleteDraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteDraft = useCallback(async (request: DeleteDraftRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await characterClient.deleteDraft(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to delete draft');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteDraft, loading, error };
}

// Race API hooks
export function useListRaces({
  pageSize = 50,
  enabled = true,
}: {
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const [state, setState] = useState<ListState<RaceInfo>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchRaces = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListRacesRequestSchema, {
          pageSize,
          pageToken: pageToken || '',
        });
        const response = await characterClient.listRaces(request);
        setState({
          data: response.races || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (err) {
        setState({
          data: [],
          loading: false,
          error:
            err instanceof Error ? err : new Error('Failed to fetch races'),
        });
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (enabled) {
      void fetchRaces();
    }
  }, [fetchRaces, enabled]);

  return {
    ...state,
    refetch: (pageToken?: string) => fetchRaces(pageToken),
    loadMore: state.nextPageToken
      ? () => fetchRaces(state.nextPageToken)
      : undefined,
  };
}

// Class API hooks
export function useListClasses({
  pageSize = 50,
  enabled = true,
}: {
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const [state, setState] = useState<ListState<ClassInfo>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchClasses = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListClassesRequestSchema, {
          pageSize,
          pageToken: pageToken || '',
        });
        const response = await characterClient.listClasses(request);
        setState({
          data: response.classes || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (err) {
        setState({
          data: [],
          loading: false,
          error:
            err instanceof Error ? err : new Error('Failed to fetch classes'),
        });
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (enabled) {
      void fetchClasses();
    }
  }, [fetchClasses, enabled]);

  return {
    ...state,
    refetch: (pageToken?: string) => fetchClasses(pageToken),
    loadMore: state.nextPageToken
      ? () => fetchClasses(state.nextPageToken)
      : undefined,
  };
}

// Roll ability scores
export function useRollAbilityScores() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [response, setResponse] = useState<RollAbilityScoresResponse | null>(
    null
  );

  const rollAbilityScores = useCallback(
    async (request: RollAbilityScoresRequest) => {
      setLoading(true);
      setError(null);
      try {
        const response = await characterClient.rollAbilityScores(request);
        setResponse(response);
        return response;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error('Failed to roll ability scores');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { rollAbilityScores, response, loading, error };
}

// Equipment API hooks
export function useListEquipmentByType({
  equipmentType,
  pageSize = 50,
  enabled = true,
}: {
  equipmentType: EquipmentType;
  pageSize?: number;
  enabled?: boolean;
}) {
  const [state, setState] = useState<
    ListState<Equipment> & {
      nextPageToken?: string;
    }
  >({
    data: [],
    loading: false,
    error: null,
    nextPageToken: undefined,
  });

  const fetchEquipment = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListEquipmentByTypeRequestSchema, {
          equipmentType,
          pageSize,
          pageToken: pageToken || '',
        });
        const response = await characterClient.listEquipmentByType(request);
        setState({
          data: response.equipment || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (err) {
        setState({
          data: [],
          loading: false,
          error:
            err instanceof Error ? err : new Error('Failed to fetch equipment'),
          nextPageToken: undefined,
        });
      }
    },
    [equipmentType, pageSize]
  );

  useEffect(() => {
    if (enabled) {
      void fetchEquipment();
    }
  }, [fetchEquipment, enabled]);

  return {
    ...state,
    refetch: (pageToken?: string) => fetchEquipment(pageToken),
    loadMore: state.nextPageToken
      ? () => fetchEquipment(state.nextPageToken)
      : undefined,
  };
}

// Delete character hook
export function useDeleteCharacter() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteCharacter = useCallback(async (characterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const request = create(DeleteCharacterRequestSchema, {
        characterId,
      });
      const response = await characterClient.deleteCharacter(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to delete character');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteCharacter, loading, error };
}

// Background hooks
export function useListBackgrounds({
  pageSize = 50,
  enabled = true,
}: {
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const [state, setState] = useState<ListState<BackgroundInfo>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchBackgrounds = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      try {
        const request = create(ListBackgroundsRequestSchema, {
          pageSize,
          pageToken: pageToken || '',
        });
        const response = await characterClient.listBackgrounds(request);
        setState({
          data: response.backgrounds || [],
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as Error,
        }));
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (enabled) {
      void fetchBackgrounds();
    }
  }, [fetchBackgrounds, enabled]);

  return { ...state, refetch: fetchBackgrounds };
}
