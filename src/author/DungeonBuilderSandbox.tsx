/**
 * DungeonBuilderSandbox — the Concepts Lab mount of the builder: the
 * reference tomb loaded, fixtures mode (`fixtureAtlas` answers every
 * compile; `PutDungeon` is never called), no draft persistence. The
 * real `/author` mount is `AuthorView.tsx`.
 */
import { useMemo } from 'react';
import { DungeonBuilder } from './DungeonBuilder';
import { emitDungeon } from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';

export function DungeonBuilderSandbox() {
  const doc = useMemo(() => referenceTombDoc(), []);
  const atlas = useMemo(() => fixtureAtlasOf(doc), [doc]);
  return (
    <DungeonBuilder
      initialYaml={emitDungeon(doc)}
      fixtureAtlas={atlas}
      persistDraft={false}
      allowYamlFileIO
    />
  );
}
