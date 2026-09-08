import type { StreamResponse, UnaryResponse } from '@connectrpc/connect';
import { CompositionService } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { CharacterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuth, setAuth } from './auth';
import { authInterceptor, loggingInterceptor } from './client';

/** Minimal fake req satisfying what loggingInterceptor actually reads
 * (service.typeName, method.name, message) — cast past the rest of
 * Connect's UnaryRequest/StreamRequest shape, same convention
 * encounterStreamDispatch.test.ts's makeEvent() fixture uses. */
function makeFakeReq(overrides?: { stream?: boolean }) {
  return {
    stream: overrides?.stream ?? false,
    service: { typeName: 'test.Service' },
    method: { name: 'TestMethod' },
    message: { hello: 'world' },
  } as unknown as Parameters<ReturnType<typeof loggingInterceptor>>[0];
}

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function makeAuthReq(service: { typeName: string }) {
  return {
    stream: false,
    service,
    method: { name: 'TestMethod' },
    message: {},
    header: new Headers(),
  } as unknown as Parameters<ReturnType<typeof authInterceptor>>[0];
}

describe('authInterceptor', () => {
  afterEach(() => {
    clearAuth();
    vi.unstubAllEnvs();
  });

  it('adds the guild selector only to Discord CompositionService calls', async () => {
    setAuth('private-token', 'player-1', '123456789012345678');
    const compositionReq = makeAuthReq(CompositionService);
    const characterReq = makeAuthReq(CharacterService);
    const next = vi.fn(async (req) => req as never);

    await authInterceptor(next)(compositionReq);
    await authInterceptor(next)(characterReq);

    expect(compositionReq.header.get('authorization')).toBe(
      'Discord private-token'
    );
    expect(compositionReq.header.get('x-rpg-guild-id')).toBe(
      '123456789012345678'
    );
    expect(characterReq.header.get('authorization')).toBe(
      'Discord private-token'
    );
    expect(characterReq.header.has('x-rpg-guild-id')).toBe(false);
  });

  it('uses the shared Dev decision without a guild selector', async () => {
    vi.stubEnv('VITE_DEV_PLAYER_ID', 'dev-player');
    vi.stubEnv('MODE', 'development');
    const request = makeAuthReq(CompositionService);

    await authInterceptor(async (req) => req as never)(request);

    expect(request.header.get('authorization')).toBe('Dev dev-player');
    expect(request.header.has('x-rpg-guild-id')).toBe(false);
  });
});

describe('loggingInterceptor', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('in development mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'development');
    });

    it('behaves exactly as before for a unary response: logs it, returns it unchanged', async () => {
      const unaryResponse = {
        stream: false,
        message: { ok: true },
        service: { typeName: 'test.Service' },
        header: new Headers(),
        trailer: new Headers(),
        method: { name: 'TestMethod' },
      } as unknown as UnaryResponse;
      const next = vi.fn().mockResolvedValue(unaryResponse);

      const result = await loggingInterceptor(next)(makeFakeReq());

      // Same reference — a unary response is passed through untouched, not
      // wrapped or cloned, exactly like before this change.
      expect(result).toBe(unaryResponse);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔵 Request: test.Service.TestMethod'),
        { hello: 'world' }
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('🟢 Response: test.Service.TestMethod'),
        { ok: true }
      );
    });

    it('wraps a stream response so its messages are logged, still yielding every message', async () => {
      const messages = [{ a: 1 }, { a: 2 }];
      const streamResponse = {
        stream: true,
        message: fromArray(messages),
        service: { typeName: 'test.Service' },
        header: new Headers(),
        trailer: new Headers(),
        method: { name: 'TestMethod' },
      } as unknown as StreamResponse;
      const next = vi.fn().mockResolvedValue(streamResponse);

      const result = (await loggingInterceptor(next)(
        makeFakeReq({ stream: true })
      )) as StreamResponse;

      expect(result.message).not.toBe(streamResponse.message);
      const received: unknown[] = [];
      for await (const message of result.message) {
        received.push(message);
      }
      expect(received).toEqual(messages);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stream opened: test.Service.TestMethod')
      );
    });
  });

  describe('outside development mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'production');
    });

    it('logs nothing for a unary response', async () => {
      const unaryResponse = {
        stream: false,
        message: { ok: true },
        service: { typeName: 'test.Service' },
        header: new Headers(),
        trailer: new Headers(),
        method: { name: 'TestMethod' },
      } as unknown as UnaryResponse;
      const next = vi.fn().mockResolvedValue(unaryResponse);

      const result = await loggingInterceptor(next)(makeFakeReq());

      expect(result).toBe(unaryResponse);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs nothing for a stream response and leaves it completely unwrapped', async () => {
      const messages = [{ a: 1 }, { a: 2 }];
      const streamResponse = {
        stream: true,
        message: fromArray(messages),
        service: { typeName: 'test.Service' },
        header: new Headers(),
        trailer: new Headers(),
        method: { name: 'TestMethod' },
      } as unknown as StreamResponse;
      const next = vi.fn().mockResolvedValue(streamResponse);

      const result = await loggingInterceptor(next)(
        makeFakeReq({ stream: true })
      );

      // Same reference — not wrapped at all when not in development, so
      // there is zero overhead/behavior change in production.
      expect(result).toBe(streamResponse);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs nothing on error, but still rethrows', async () => {
      const next = vi.fn().mockRejectedValue(new Error('boom'));

      await expect(loggingInterceptor(next)(makeFakeReq())).rejects.toThrow(
        'boom'
      );
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
