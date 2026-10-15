/**
 * A deferred fake of the authoring boundary for tests: every `putDungeon`
 * and `getDungeon` is recorded with a deferred answer the test resolves or
 * rejects, so a test drives the exact order of every asynchronous seam.
 * Shared by the World Builder publishing panel's tests, the studio's
 * Save and Play tests and the studio's Open panel tests (S7), which also
 * drive `listDungeons`, `deleteDungeon` and `renameDungeon` the same way.
 */
import { vi } from 'vitest';
import type { AuthoringClient, AuthoringLibraryClient } from '../authoringRpc';

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type PutAnswer = {
  errors: Array<{ path: string; message: string }>;
};
export type GetAnswer = { yaml: string };

export interface FakePut {
  request: { key: string; yaml: string; validateOnly: boolean };
  deferred: Deferred<never>;
}
export interface FakeGet {
  key: string;
  deferred: Deferred<never>;
}
/** A recorded Delete or Rename; `newKey` is empty for a Delete. */
export interface FakeMove {
  key: string;
  newKey: string;
  deferred: Deferred<undefined | Error>;
}
export type ListAnswer = {
  dungeons: Array<{ key: string; name: string; source: number; owner: string }>;
};

/** Where the fake records its calls. Read at call time, so a test may
 * replace the answer lists between cases. */
export interface FakeAuthoringSink {
  readonly puts: FakePut[];
  readonly gets: FakeGet[];
  readonly putAnswers: Deferred<PutAnswer>[];
  readonly getAnswers: Deferred<GetAnswer | Error>[];
  /** Optional, so suites written before S7 need not declare them. */
  readonly lists?: Deferred<ListAnswer | Error>[];
  readonly deletes?: FakeMove[];
  readonly renames?: FakeMove[];
}

export function fakeAuthoringClient(
  sink: FakeAuthoringSink
): AuthoringClient & AuthoringLibraryClient {
  return {
    putDungeon: vi.fn(async (request: never) => {
      const record = request as unknown as {
        key: string;
        yaml: string;
        validateOnly: boolean;
      };
      const deferred = makeDeferred<PutAnswer>();
      sink.puts.push({ request: record, deferred: deferred as never });
      sink.putAnswers.push(deferred);
      return deferred.promise as never;
    }),
    getDungeon: vi.fn(async (request: never) => {
      const record = request as unknown as { key: string };
      const deferred = makeDeferred<GetAnswer | Error>();
      sink.gets.push({ key: record.key, deferred: deferred as never });
      sink.getAnswers.push(deferred);
      const answer = await deferred.promise;
      if (answer instanceof Error) throw answer;
      return answer as never;
    }),
    listScenarios: vi.fn(),
    listDungeons: vi.fn(async () => {
      const deferred = makeDeferred<ListAnswer | Error>();
      sink.lists?.push(deferred);
      const answer = await deferred.promise;
      if (answer instanceof Error) throw answer;
      return answer as never;
    }),
    deleteDungeon: vi.fn(async (request: never) => {
      const { key } = request as unknown as { key: string };
      const deferred = makeDeferred<undefined | Error>();
      sink.deletes?.push({ key, newKey: '', deferred });
      const answer = await deferred.promise;
      if (answer instanceof Error) throw answer;
      return {} as never;
    }),
    renameDungeon: vi.fn(async (request: never) => {
      const { key, newKey } = request as unknown as {
        key: string;
        newKey: string;
      };
      const deferred = makeDeferred<undefined | Error>();
      sink.renames?.push({ key, newKey, deferred });
      const answer = await deferred.promise;
      if (answer instanceof Error) throw answer;
      return {} as never;
    }),
  } as unknown as AuthoringClient & AuthoringLibraryClient;
}
