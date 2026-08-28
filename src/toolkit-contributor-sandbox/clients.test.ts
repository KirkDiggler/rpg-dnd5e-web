import type { UnaryResponse } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { toolkitSandboxInterceptors } from './clients';

type SandboxInterceptor =
  (typeof toolkitSandboxInterceptors)[keyof typeof toolkitSandboxInterceptors];
type SandboxRequest = Parameters<ReturnType<SandboxInterceptor>>[0];

function makeFakeUnaryRequest(): SandboxRequest {
  return {
    header: new Headers(),
  } as SandboxRequest;
}

function makeFakeUnaryResponse(): UnaryResponse {
  return {
    stream: false,
    header: new Headers(),
    trailer: new Headers(),
  } as unknown as UnaryResponse;
}

describe('toolkit sandbox client interceptors', () => {
  it('keeps each fixed Dev authorization header isolated for interleaved unary calls', async () => {
    const capturedAuthorization: Array<string | null> = [];
    const fighterInterceptor = toolkitSandboxInterceptors.fighter;
    const barbarianInterceptor = toolkitSandboxInterceptors.barbarian;
    const fighterRequest = makeFakeUnaryRequest();
    const barbarianRequest = makeFakeUnaryRequest();
    const secondFighterRequest = makeFakeUnaryRequest();
    const captureAuthorization = async (request: SandboxRequest) => {
      await Promise.resolve();
      capturedAuthorization.push(request.header.get('authorization'));
      return makeFakeUnaryResponse();
    };

    await Promise.all([
      fighterInterceptor(captureAuthorization)(fighterRequest),
      barbarianInterceptor(captureAuthorization)(barbarianRequest),
      fighterInterceptor(captureAuthorization)(secondFighterRequest),
    ]);

    expect(capturedAuthorization).toEqual([
      'Dev toolkit-sandbox-fighter',
      'Dev toolkit-sandbox-barbarian',
      'Dev toolkit-sandbox-fighter',
    ]);
  });
});
