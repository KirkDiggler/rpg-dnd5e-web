import type {
  Character,
  CharacterDraft,
  CreateDraftRequest,
  DeleteCharacterRequest,
  DeleteDraftRequest,
  FinalizeDraftRequest,
  GetCharacterRequest,
  GetDraftRequest,
  ListCharactersRequest,
  ListDraftsRequest,
  UpdateAbilityScoresRequest,
  UpdateBackgroundRequest,
  UpdateClassRequest,
  UpdateNameRequest,
  UpdateRaceRequest,
  UpdateSkillsRequest,
  ValidateDraftRequest,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
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
  totalSize?: number;
}

// Character hooks
export function useGetCharacter(characterId: string) {
  const [state, setState] = useState<AsyncState<Character>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchCharacter = useCallback(async () => {
    if (!characterId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const request: GetCharacterRequest = { characterId };
      const response = await characterClient.getCharacter(request);
      setState({
        data: response.character || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    }
  }, [characterId]);

  useEffect(() => {
    fetchCharacter();
  }, [fetchCharacter]);

  return { ...state, refetch: fetchCharacter };
}

export function useListCharacters(
  filters: Partial<Pick<ListCharactersRequest, 'sessionId' | 'playerId'>> = {},
  pageSize = 20
) {
  const [state, setState] = useState<ListState<Character>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchCharacters = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const request: ListCharactersRequest = {
          pageSize,
          pageToken: pageToken || '',
          sessionId: filters.sessionId || '',
          playerId: filters.playerId || '',
        };

        const response = await characterClient.listCharacters(request);

        setState({
          data: response.characters,
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
          totalSize: response.totalSize,
        });
      } catch (error) {
        setState({
          data: [],
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    },
    [filters.sessionId, filters.playerId, pageSize]
  );

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  return {
    ...state,
    refetch: fetchCharacters,
    loadMore: state.nextPageToken
      ? () => fetchCharacters(state.nextPageToken)
      : undefined,
  };
}

// Character draft hooks
export function useGetDraft(draftId: string) {
  const [state, setState] = useState<AsyncState<CharacterDraft>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchDraft = useCallback(async () => {
    if (!draftId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const request: GetDraftRequest = { draftId };
      const response = await characterClient.getDraft(request);
      setState({
        data: response.draft || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    }
  }, [draftId]);

  useEffect(() => {
    fetchDraft();
  }, [fetchDraft]);

  return { ...state, refetch: fetchDraft };
}

export function useListDrafts(
  filters: Partial<Pick<ListDraftsRequest, 'playerId' | 'sessionId'>> = {},
  pageSize = 20
) {
  const [state, setState] = useState<ListState<CharacterDraft>>({
    data: [],
    loading: false,
    error: null,
  });

  const fetchDrafts = useCallback(
    async (pageToken?: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const request: ListDraftsRequest = {
          playerId: filters.playerId || '',
          sessionId: filters.sessionId || '',
          pageSize,
          pageToken: pageToken || '',
        };

        const response = await characterClient.listDrafts(request);

        setState({
          data: response.drafts,
          loading: false,
          error: null,
          nextPageToken: response.nextPageToken,
        });
      } catch (error) {
        setState({
          data: [],
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    },
    [filters.playerId, filters.sessionId, pageSize]
  );

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  return {
    ...state,
    refetch: fetchDrafts,
    loadMore: state.nextPageToken
      ? () => fetchDrafts(state.nextPageToken)
      : undefined,
  };
}

// Imperative action hooks
export function useCreateDraft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDraft = useCallback(async (request: CreateDraftRequest) => {
    setLoading(true);
    setError(null);

    try {
      const response = await characterClient.createDraft(request);
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
        setLoading(false);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setLoading(false);
        throw error;
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
        setLoading(false);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setLoading(false);
        throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
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
      setLoading(false);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  return { deleteDraft, loading, error };
}

export function useDeleteCharacter() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteCharacter = useCallback(
    async (request: DeleteCharacterRequest) => {
      setLoading(true);
      setError(null);

      try {
        const response = await characterClient.deleteCharacter(request);
        setLoading(false);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    []
  );

  return { deleteCharacter, loading, error };
}
