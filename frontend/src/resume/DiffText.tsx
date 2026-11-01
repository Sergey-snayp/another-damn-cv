import { wordDiff } from './wordDiff';

/** A reworded line, with only the words that moved marked. */
export function DiffText({ before, after }: { before: string; after: string }) {
  return (
    <span className="difftext">
      {wordDiff(before, after).map((piece, index) =>
        piece.kind === 'same'
          ? <span key={index}>{piece.text}</span>
          : <span key={index} className={`w-${piece.kind}`}>{piece.text}</span>)}
    </span>
  );
}
