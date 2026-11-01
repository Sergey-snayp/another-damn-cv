/**
 * The first balanced JSON object in a model's answer.
 *
 * Models wrap JSON in prose or code fences; this finds the object anyway and
 * returns null rather than throwing, so each caller words its own error.
 */
export function firstJsonObject(text: string): unknown {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = body.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const char = body[i];

    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
