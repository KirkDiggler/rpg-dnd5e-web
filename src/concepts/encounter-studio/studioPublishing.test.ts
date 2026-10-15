import { describe, expect, it } from 'vitest';
import { keyRefusalOf, type StudioPublishing } from './studioPublishing';

/** Only the fields `keyRefusalOf` reads. */
function publishingWith(
  overrides: Partial<{
    error: string | null;
    saver: Partial<StudioPublishing['saver']>;
    preview: Partial<StudioPublishing['preview']>;
  }>
): StudioPublishing {
  return {
    error: overrides.error ?? null,
    saver: { status: 'idle', errors: [], message: null, ...overrides.saver },
    preview: {
      status: 'idle',
      errors: [],
      message: null,
      ...overrides.preview,
    },
  } as unknown as StudioPublishing;
}

describe('keyRefusalOf', () => {
  it('shows the reference sentence from a preview refusal', () => {
    expect(
      keyRefusalOf(
        publishingWith({
          preview: {
            status: 'unreachable',
            message:
              'PermissionDenied: that key is a reference; save it under your own key',
          },
        })
      )
    ).toBe('that key is a reference; save it under your own key');
  });

  it('…and the another-member sentence', () => {
    expect(
      keyRefusalOf(
        publishingWith({
          saver: {
            status: 'error',
            message:
              'PermissionDenied: that key belongs to another member of this world',
          },
        })
      )
    ).toBe('that key belongs to another member of this world');
    expect(
      keyRefusalOf(
        publishingWith({
          error:
            'Could not check whether “my-castle” already exists: PermissionDenied: that key belongs to another member of this world',
        })
      )
    ).toBe('that key belongs to another member of this world');
  });

  it('still reads the grammar refusal and ignores other denials', () => {
    expect(
      keyRefusalOf(
        publishingWith({
          saver: {
            status: 'error',
            message: 'InvalidArgument: key must match [a-z0-9-]+',
          },
        })
      )
    ).toBe('key must match [a-z0-9-]+');
    expect(
      keyRefusalOf(
        publishingWith({
          saver: {
            status: 'error',
            message: 'PermissionDenied: not a builder',
          },
        })
      )
    ).toBeNull();
  });
});
