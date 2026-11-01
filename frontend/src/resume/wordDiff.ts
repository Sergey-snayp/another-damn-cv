export type Piece = { text: string; kind: 'same' | 'added' | 'removed' };

/**
 * Word-level difference between two strings.
 *
 * A longest-common-subsequence over words rather than characters: people read
 * a reworded sentence in words, and a character diff on prose produces
 * unreadable confetti.
 *
 * Whitespace is kept with its word so the rebuilt text spaces correctly.
 */
export function wordDiff(before: string, after: string): Piece[] {
  const a = tokenise(before);
  const b = tokenise(after);

  const table = lcsTable(a, b);
  const pieces: Piece[] = [];

  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(pieces, 'same', a[i]!);
      i++; j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      push(pieces, 'removed', a[i]!);
      i++;
    } else {
      push(pieces, 'added', b[j]!);
      j++;
    }
  }

  while (i < a.length) push(pieces, 'removed', a[i++]!);
  while (j < b.length) push(pieces, 'added', b[j++]!);

  return pieces;
}

/** Adjacent pieces of the same kind read better merged. */
function push(pieces: Piece[], kind: Piece['kind'], text: string): void {
  const last = pieces[pieces.length - 1];

  if (last && last.kind === kind) {
    last.text += text;
    return;
  }

  pieces.push({ text, kind });
}

function tokenise(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * table[i][j] = length of the longest common subsequence of a[i:] and b[j:].
 *
 * Built backwards so the walk above can read it forwards and decide, at each
 * step, whether dropping a word from one side or the other loses less.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  return table;
}
