/**
 * fileIO — the browser-native "download this text as a file" primitive
 * behind the Download .yaml button (`YamlPane.tsx`'s `DownloadYamlButton`,
 * local-drafts unit). No server involvement, no transformation of the
 * text: Kirk's ruling is that a saved/downloaded artifact is ALWAYS the
 * complete authoring dialect — "compatibility stripping should happen at
 * load time not save" — so this function exists purely to hand the
 * browser a string and a filename; stripping stays exactly where it
 * already lived (`dungeonYaml.ts`'s `stripToV1Subset`, the transient
 * send-time projection Save & Play already uses, unchanged by this unit).
 *
 * The Load side has no matching helper here — reading a `File`'s text is
 * already a browser one-liner (`file.text()`), called directly from
 * `YamlPane.tsx`'s `LoadYamlButton`; the only genuinely fiddly DOM
 * orchestration is on the download side (Blob + object URL + a synthetic
 * anchor click), which is what's worth isolating and unit-testing here.
 */

/** Triggers a browser download of `text` as `filename` — the standard
 * Blob + temporary object-URL + synthetic-click pattern. Revokes the
 * object URL immediately after the click so this doesn't leak one per
 * download. */
export function downloadYamlFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/x-yaml' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}
