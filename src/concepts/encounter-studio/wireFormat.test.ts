import { AuthoringService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';

describe('wire format', () => {
  it('the authoring client has the item and status word calls', () => {
    const methods: Record<string, unknown> = AuthoringService.method;
    expect(methods.getItemWords).toBeDefined();
    expect(methods.getStatusWords).toBeDefined();
    expect(methods.sayStatus).toBeDefined();
    // typed access: fails to compile when the generated client lacks them
    expect(AuthoringService.method.getItemWords.name).toBe('GetItemWords');
    expect(AuthoringService.method.getStatusWords.name).toBe('GetStatusWords');
    expect(AuthoringService.method.sayStatus.name).toBe('SayStatus');
  });
});
