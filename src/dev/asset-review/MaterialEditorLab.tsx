import { useEffect, useState, type ReactElement } from 'react';
import { MaterialEditorWorkbench } from './MaterialEditorWorkbench';
import {
  parseMaterialEditorManifest,
  type MaterialEditorManifest,
} from './materialRecipe';
import { TexturePackWorkspace } from './TexturePackWorkspace';

export function MaterialEditorLab(): ReactElement {
  const advanced =
    new URLSearchParams(window.location.search).get('materialWorkbench') ===
    '1';
  const [manifest, setManifest] = useState<MaterialEditorManifest>(),
    [error, setError] = useState('');
  useEffect(() => {
    if (advanced) return;
    let active = true;
    void fetch('/models/synty/asset-review-editor/manifest.json')
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Material editor manifest returned ${response.status}`
          );
        return parseMaterialEditorManifest(await response.json());
      })
      .then((value) => {
        if (active) setManifest(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [advanced]);
  if (advanced) return <MaterialEditorWorkbench />;
  if (!manifest)
    return (
      <main className="material-editor">
        <h1>Texture packs</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Loading texture inventory…</p>
        )}
      </main>
    );
  return <TexturePackWorkspace manifest={manifest} />;
}
