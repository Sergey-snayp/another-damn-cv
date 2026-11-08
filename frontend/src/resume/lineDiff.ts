/**
 * What changed between a CV line and its new version, word by word: what stays, what was
 * taken out and what was put in. Bold (**word**) is kept for display; it is not a change.
 */

export interface DiffPiece {
  op: 'same' | 'del' | 'add';
  text: string;
  bold: boolean;
  /** Whitespace stood before this word. */
  space: boolean;
}

interface Token { text: string; bold: boolean; space: boolean }

// A word, one punctuation mark, or a bold marker; with the whitespace before it.
const TOKEN = /(\s*)(\*\*|[^\s.,;:!?()"*]+|[.,;:!?()"*])/g;

function tokenize(marked: string): Token[] {
  const tokens: Token[] = [];
  let bold = false;
  let space = false;
  for (const match of marked.matchAll(TOKEN)) {
    space ||= match[1]!.length > 0;
    if (match[2] === '**') { bold = !bold; continue; }
    tokens.push({ text: match[2]!, bold, space: tokens.length > 0 && space });
    space = false;
  }
  return tokens;
}

/** A stretch this short between two changes reads better as part of the change. */
const GLUE = /^(?:[.,;:!?()"]|a|an|the|and|or|of|to|in|on|for|by|with|at|as)$/i;
const isGlue = (run: Pair[]) => run.length <= 2 && run.every((pair) => GLUE.test(pair.after.text));

/** A word both versions have: as it was, and as it is now (its bold and spacing may differ). */
interface Pair { before: Token; after: Token }

export function lineDiff(before: string, after: string): DiffPiece[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // Longest common subsequence of words, from the end, so the walk below goes forwards.
  const width = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i]!.text === b[j]!.text
        ? lcs[(i + 1) * width + j + 1]! + 1
        : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }
  // Runs: words both versions share, and the change between two such runs.
  type Run = { same: Pair[] } | { del: Token[]; add: Token[] };
  const runs: Run[] = [];
  const change = () => {
    const last = runs.at(-1);
    if (last && 'del' in last) return last;
    const next = { del: [] as Token[], add: [] as Token[] };
    runs.push(next);
    return next;
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i]!.text === b[j]!.text) {
      const last = runs.at(-1);
      const pair = { before: a[i]!, after: b[j]! };
      if (last && 'same' in last) last.same.push(pair); else runs.push({ same: [pair] });
      i++; j++;
    } else if (j < b.length && (i === a.length || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)) {
      change().add.push(b[j++]!);
    } else {
      change().del.push(a[i++]!);
    }
  }
  // "and", "a", a comma between two changes: folded into one change instead of a patchwork.
  for (let k = 1; k < runs.length - 1; k++) {
    const run = runs[k]!;
    const prev = runs[k - 1]!;
    const next = runs[k + 1]!;
    if ('same' in run && 'del' in prev && 'del' in next && isGlue(run.same)) {
      prev.del.push(...run.same.map((pair) => pair.before), ...next.del);
      prev.add.push(...run.same.map((pair) => pair.after), ...next.add);
      runs.splice(k, 2);
      k--;
    }
  }
  const pieces: DiffPiece[] = [];
  const put = (op: DiffPiece['op'], tokens: Token[]) => {
    tokens.forEach((token, index) => pieces.push({ op, text: token.text, bold: token.bold,
      // A change starts where its first word stood: with a space unless it is punctuation.
      space: pieces.length > 0 && (index > 0 ? token.space : token.space || /^[^.,;:!?)]/.test(token.text) && pieces.at(-1)!.text !== '(') }));
  };
  for (const run of runs) {
    // A kept word shows as in the new version: its bold and its spacing.
    if ('same' in run) put('same', run.same.map((pair) => pair.after));
    else { put('del', run.del); put('add', run.add); }
  }
  return pieces;
}
