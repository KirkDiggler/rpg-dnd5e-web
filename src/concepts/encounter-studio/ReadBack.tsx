import type { ReactNode } from 'react';
import { ENGINE_LAWS } from '../world-building/engineLaws';
import {
  readBackOf,
  type ReadBackParagraph,
  type ReadBackSentence,
  type ReadBackTarget,
} from '../world-building/readBack';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { StudioSection } from './StudioSection';

export interface ReadBackProps {
  document: Readonly<RoomDraftDocument>;
  selection: { kind: 'creature' | 'prop'; id: string };
  /** Select or open what a ref names; a fact opens the fact index on it. */
  onRef?(target: ReadBackTarget): void;
}

/** The selected creature's or prop's configuration, read back as prose from
 * the draft (rpg-project#576, R5). It heads the view, above Placement. A law
 * sentence carries its toolkit source as its title. */
export function ReadBack({
  document,
  selection,
  onRef,
}: ReadBackProps): React.JSX.Element {
  const paragraphs = readBackOf(document, selection);
  return (
    <div className="es-context-panel">
      <StudioSection title="Read back" level="section" className="es-readback">
        {paragraphs.map((paragraph) => (
          <Paragraph
            key={paragraph.heading}
            paragraph={paragraph}
            onRef={onRef}
          />
        ))}
      </StudioSection>
    </div>
  );
}

function Paragraph({
  paragraph,
  onRef,
}: {
  paragraph: ReadBackParagraph;
  onRef?(target: ReadBackTarget): void;
}): React.JSX.Element {
  return (
    <div className="es-readback-paragraph" data-readback={paragraph.heading}>
      <p>
        {paragraph.sentences.map((s, index) => (
          <span key={index}>
            {index > 0 && ' '}
            <Sentence
              sentence={s}
              lead={index === 0 ? paragraph.lead : undefined}
              onRef={onRef}
            />
          </span>
        ))}
      </p>
      {paragraph.items && (
        <ul>
          {paragraph.items.map((item, index) => (
            <li key={index}>
              <Sentence sentence={item} onRef={onRef} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One sentence: its refs as links (facts as emphasis), its lead bold. */
function Sentence({
  sentence,
  lead,
  onRef,
}: {
  sentence: ReadBackSentence;
  lead?: string;
  onRef?(target: ReadBackTarget): void;
}): React.JSX.Element {
  const text = sentence.text;
  const boldTo = lead !== undefined && text.startsWith(lead) ? lead.length : 0;
  const pieces: ReactNode[] = [];
  let at = 0;
  // Each ref is placed at its first occurrence at or after the cursor, in
  // text order, so a word that names a fact twice links the first.
  const placed = sentence.refs
    .map((ref) => ({ ref, index: text.indexOf(ref.text) }))
    .filter((p) => p.index >= 0)
    .sort((a, b) => a.index - b.index);
  const plain = (from: number, to: number) => {
    if (to <= from) return;
    if (from < boldTo) {
      const cut = Math.min(to, boldTo);
      pieces.push(<strong key={`b${from}`}>{text.slice(from, cut)}</strong>);
      if (cut < to) pieces.push(text.slice(cut, to));
    } else pieces.push(text.slice(from, to));
  };
  for (const { ref, index } of placed) {
    if (index < at) continue;
    plain(at, index);
    const label = text.slice(index, index + ref.text.length);
    const fact = ref.target.kind === 'fact';
    const inner = fact ? <em>{label}</em> : label;
    pieces.push(
      onRef ? (
        <button
          key={`r${index}`}
          type="button"
          className="es-link es-readback-ref"
          data-ref-kind={ref.target.kind}
          aria-label={`Open ${ref.target.kind} ${ref.target.id}`}
          onClick={() => onRef(ref.target)}
        >
          {index < boldTo ? <strong>{inner}</strong> : inner}
        </button>
      ) : (
        <span key={`r${index}`}>{inner}</span>
      )
    );
    at = index + ref.text.length;
  }
  plain(at, text.length);
  return (
    <span
      className={sentence.law ? 'es-readback-law' : undefined}
      title={sentence.law ? ENGINE_LAWS[sentence.law].source : undefined}
      data-law={sentence.law}
    >
      {pieces}
    </span>
  );
}
