/**
 * DungeonBuilderSandbox — the Concepts Lab mount of the builder: a
 * query-selected fixture loaded (`reference-tomb` by default,
 * `crypt-prop-showcase` for `?authorFixture=crypt-props` and
 * `crypt-lighting-showcase` for `?authorFixture=crypt-lighting`), fixtures mode
 * (`fixtureCompile` shapes an atlas from the CURRENT document on every
 * edit; `PutDungeon` is never called), no draft persistence. The real
 * `/author` mount is `AuthorView.tsx`.
 */
import { useMemo } from 'react';
import { DungeonBuilder } from './DungeonBuilder';
import { emitDungeon, type DungeonDoc } from './dungeonYaml';
import { cryptLightingShowcaseDoc } from './fixtures/cryptLightingShowcase';
import { cryptPropShowcaseDoc } from './fixtures/cryptPropShowcase';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';

// eslint-disable-next-line react-refresh/only-export-components
export function sandboxDocForSearch(search: string): DungeonDoc {
  const fixture = new URLSearchParams(search).get('authorFixture');
  if (fixture === 'crypt-lighting') return cryptLightingShowcaseDoc();
  if (fixture === 'crypt-props') return cryptPropShowcaseDoc();
  return referenceTombDoc();
}

export function DungeonBuilderSandbox() {
  const initialYaml = useMemo(
    () => emitDungeon(sandboxDocForSearch(window.location.search)),
    []
  );
  // The Lab mounts the builder in ordinary document flow, so it hands it a
  // definite box to fill; the real `/author` shell is a viewport-tall flex
  // column and gives it the remaining height instead.
  return (
    <div className="dg-stage">
      <DungeonBuilder
        initialYaml={initialYaml}
        fixtureCompile={fixtureAtlasOf}
        persistDraft={false}
        allowYamlFileIO
      />
    </div>
  );
}
