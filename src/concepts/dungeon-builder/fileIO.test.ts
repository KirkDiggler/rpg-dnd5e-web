import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadYamlFile } from './fileIO';

// jsdom implements neither `URL.createObjectURL`/`revokeObjectURL` nor a
// real navigating `HTMLAnchorElement.prototype.click` — stub both so this
// test exercises the real DOM orchestration (anchor href/download/click,
// object-URL create+revoke) without needing an actual browser.
describe('downloadYamlFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL =
      revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    clickSpy = vi.fn();
    HTMLAnchorElement.prototype.click =
      clickSpy as unknown as typeof HTMLAnchorElement.prototype.click;
  });

  afterEach(() => {
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
