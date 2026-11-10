import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocksOf, marksToHtml, spansOf, withoutMarks } from '../src/text/marks.ts';

test('marks: bold, italic, underline, links and lists live inside plain text', () => {
  assert.deepEqual(spansOf('Built **Kafka** pipelines, *fast*, ++safe++, see [site](https://a.dev/x).'), [
    { text: 'Built ' }, { text: 'Kafka', bold: true }, { text: ' pipelines, ' }, { text: 'fast', italic: true },
    { text: ', ' }, { text: 'safe', underline: true }, { text: ', see ' }, { text: 'site', href: 'https://a.dev/x' }, { text: '.' },
  ]);
  assert.deepEqual(spansOf('**[site](https://a.dev)**'), [{ text: 'site', bold: true, href: 'https://a.dev' }]);
  assert.deepEqual(spansOf('2 * 3 * 4 and a*b'), [{ text: '2 * 3 * 4 and a*b' }], 'a lone asterisk is not italic');
  assert.equal(withoutMarks('- Led **3** people at [Acme](https://acme.com)\n- *Cut* costs'), 'Led 3 people at Acme\nCut costs');
  assert.deepEqual(blocksOf('Intro.\n- one\n- two\nEnd.').map((block) => [block.list, block.lines]), [[false, ['Intro.']], [true, ['one', 'two']], [false, ['End.']]]);
  assert.equal(marksToHtml('A **b**\n- x'), '<div>A <b>b</b></div><ul><li>x</li></ul>');
  assert.equal(marksToHtml('<script>'), '<div>&lt;script&gt;</div>', 'text is escaped');
});
