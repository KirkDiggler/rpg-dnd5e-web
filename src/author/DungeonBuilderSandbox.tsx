/**
 * DungeonBuilderSandbox — the Concepts Lab mount of the builder: the
 * reference tomb loaded, fixtures mode (`fixtureCompile` shapes an atlas
 * from the CURRENT document on every edit; `PutDungeon` is never
 * called), no draft persistence. The real `/author` mount is
 * `AuthorView.tsx`.
 */
import { useMemo } from 'react';
import { DungeonBuilder } from './DungeonBuilder';
import { emitDungeon } from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';

export function DungeonBuilderSandbox() {
  const initialYaml = useMemo(() => emitDungeon(referenceTombDoc()), []);
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
