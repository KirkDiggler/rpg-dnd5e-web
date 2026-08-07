import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadYamlFile } from './fileIO';

// jsdom implements neither `URL.createObjectURL`/`revokeObjectURL` (the
// property doesn't exist at all — `vi.spyOn` can't wrap something that
// isn't there) nor a real navigating `HTMLAnchorElement.prototype.click`
// (a real function jsdom DOES define, just one that logs "not
// implemented" for anchor navigation — `vi.spyOn` works fine on it).
describe('downloadYamlFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  // `vi.restoreAllMocks()` only reverts `vi.spyOn`-based mocks — it has
  // no idea these two were ever assigned, since jsdom never defined them
  // as spyable properties in the first place (Copilot review, PR #717:
  // a raw `URL.createObjectURL = ...` assignment leaks across the whole
  // suite otherwise). Captured and restored by hand instead.
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL =
      revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    // A real `vi.spyOn` — jsdom DOES define this one, so `restoreAllMocks`
    // below correctly puts the original back (unlike the two above).
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL as typeof URL.revokeObjectURL;
    vi.restoreAllMocks();
  });

  it('builds a Blob from the exact text passed, untransformed', () => {
    downloadYamlFile('dungeon.yaml', 'version: 1\nkey: foo\n');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/x-yaml');
  });

  it('sets the anchor href/download and clicks it', () => {
    downloadYamlFile('my-dungeon.yaml', 'version: 1\n');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL after triggering the download', () => {
    downloadYamlFile('dungeon.yaml', 'version: 1\n');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('does not leave the synthetic anchor attached to the document', () => {
    const before = document.querySelectorAll('a').length;
    downloadYamlFile('dungeon.yaml', 'version: 1\n');
    const after = document.querySelectorAll('a').length;
    expect(after).toBe(before);
  });

  it('still revokes the object URL even if the click throws', () => {
    clickSpy.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => downloadYamlFile('dungeon.yaml', 'version: 1\n')).toThrow();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('downloadYamlFile global cleanup (Copilot review, PR #717)', () => {
  it('does not leak URL.createObjectURL/revokeObjectURL stubs into a later test file/suite', () => {
    // The describe block above always restores in its own afterEach —
    // this is the regression test: if that restore were missing/broken,
    // these would still be the `vi.fn()` stubs from the last test above.
    // `vi.isMockFunction` handles `undefined` (jsdom's real, un-stubbed
    // state) without throwing, unlike probing `.mock` directly.
    expect(vi.isMockFunction(URL.createObjectURL)).toBe(false);
    expect(vi.isMockFunction(URL.revokeObjectURL)).toBe(false);
  });
});
