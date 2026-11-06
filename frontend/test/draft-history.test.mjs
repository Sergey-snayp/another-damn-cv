import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DraftHistory } from '../src/resume/draftHistory.ts';

const source = () => ({
  snapshot: 7,
  contact: { lineageId: 'contact', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
  summaries: { default: 'Original summary.' },
  experiences: [{ lineageId: 'role', company: 'Acme', title: 'Engineer', from: '2020', achievements: [
    { lineageId: 'bullet', experienceLineageId: 'role', bullet: 'Built services.', weight: 4 },
  ] }],
  educations: [{ lineageId: 'school', institution: 'University', degree: 'BSc', from: '2014' }],
  skills: [{ lineageId: 'skill-a', name: 'Node.js', aliases: ['Node'] }, { lineageId: 'skill-b', name: 'Python' }],
  projects: [], certifications: [], customSections: [],
});

test('edits, additions and removals undo and redo without mutating the source or losing metadata', () => {
  const original = source(), history = new DraftHistory();
  const initial = history.reset(original);
  history.change(document => { document.summaries.default = 'Edited summary.'; });
  history.change(document => { document.skills.splice(1, 1); document.educations.push({ institution: 'New school', degree: 'MSc', from: '2020' }); });
  assert.equal(history.current.document.educations.length, 2);
  assert.ok(history.current.document.educations[1].lineageId);
  history.move(-1);
  assert.equal(history.current.document.skills[1].name, 'Python');
  assert.equal(history.current.document.educations.length, 1);
  history.move(-1);
  assert.equal(history.current.id, initial.id);
  assert.equal(history.current.document.summaries.default, 'Original summary.');
  assert.equal(history.move(-1), null);
  history.move(1);
  history.move(1);
  assert.equal(history.current.document.summaries.default, 'Edited summary.');
  assert.deepEqual(history.current.document.skills[0].aliases, ['Node']);
  assert.equal(history.current.document.experiences[0].achievements[0].weight, 4);
  assert.equal(history.move(1), null);
  assert.deepEqual(original, source());
});

test('no-op edits preserve redo, while a new edit after Undo replaces the redo path', () => {
  const history = new DraftHistory();
  history.reset(source());
  history.change(document => { document.summaries.default = 'First edit.'; });
  history.move(-1);
  assert.equal(history.change(document => { document.summaries.default = 'Original summary.'; }), null);
  assert.equal(history.canRedo, true);
  history.change(document => { document.summaries.default = 'New branch.'; });
  assert.equal(history.canRedo, false);
  assert.equal(history.move(1), null);
});

test('Undo restores explicit empty values so a subsequent Save clears previously populated fields', () => {
  const history = new DraftHistory();
  const document = source();
  document.contact = null;
  history.reset(document);
  history.change(draft => { draft.contact.firstName = 'Sam'; draft.educations[0].to = '2020'; });
  const sent = history.current.document;
  history.acceptSaved(sent, { ...structuredClone(sent), snapshot: 1 }, true);
  history.move(-1);
  assert.equal(history.current.document.contact.firstName, '');
  assert.equal(history.current.document.educations[0].to, null);
});

test('history survives Save with new copy IDs, including deleted rows and the redo path', () => {
  const history = new DraftHistory();
  const initial = history.reset(source());
  const checkpoint = history.change(document => { document.skills.pop(); });
  history.change(document => { document.summaries.default = 'Future edit.'; });
  history.move(-1);
  const sent = history.current.document;
  const saved = structuredClone(sent);
  saved.snapshot = 1;
  for (const row of [saved.contact, ...saved.experiences, ...saved.experiences.flatMap(role => role.achievements), ...saved.educations, ...saved.skills]) {
    row.lineageId = `copy-${row.lineageId}`;
    row.id = `row-${row.lineageId}`;
    row.resumeId = 'copy';
    if (row.experienceLineageId) row.experienceLineageId = `copy-${row.experienceLineageId}`;
  }
  history.acceptSaved(sent, saved, true);
  assert.equal(history.current.id, checkpoint.id);
  assert.equal(history.canRedo, true);
  history.move(-1);
  assert.equal(history.current.id, initial.id);
  const restored = history.current.document;
  assert.equal(restored.snapshot, 1);
  assert.equal(restored.skills[0].lineageId, 'copy-skill-a');
  assert.notEqual(restored.skills[1].lineageId, 'skill-b', 'restoring a removed source row creates a copy identity');
  assert.equal(restored.experiences[0].achievements[0].experienceLineageId, 'copy-role');
  assert.equal(restored.contact.resumeId, undefined, 'past states do not retain source bookkeeping');
  history.move(1);
  assert.equal(history.current.id, checkpoint.id, 'Redo can return to the saved checkpoint');
  history.move(1);
  assert.equal(history.current.document.snapshot, 1);
  assert.equal(history.current.document.skills[0].lineageId, 'copy-skill-a');
  assert.equal(history.current.document.summaries.default, 'Future edit.');
});

test('opening another CV clears the previous history and stale save replies do not replace it', () => {
  const history = new DraftHistory();
  history.reset(source());
  history.change(document => { document.summaries.default = 'Edit.'; });
  const sent = history.current.document;
  history.reset({ ...source(), summaries: { default: 'Another CV.' } });
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.acceptSaved(sent, source(), false), null);
  assert.equal(history.current.document.summaries.default, 'Another CV.');
});

test('Reset restores every section in one undoable step and keeps the initial saved-state identity', () => {
  const history = new DraftHistory();
  const initial = history.reset(source());
  assert.equal(history.canReset, false);
  assert.equal(history.restoreInitial(), null);
  history.change(document => {
    document.contact.firstName = 'Edited';
    document.summaries.default = 'Tailored summary.';
    document.skills.pop();
    document.educations[0].institution = 'Edited school';
  });
  const edited = structuredClone(history.current);
  const restored = history.restoreInitial();
  assert.equal(restored.id, initial.id);
  assert.deepEqual(restored.document, initial.document);
  assert.equal(history.canReset, false);
  assert.equal(history.canUndo, true);
  history.move(-1);
  assert.deepEqual(history.current, edited);
  history.move(1);
  assert.deepEqual(history.current, restored);
});

test('Reset after Save uses the rebased original and does not discard the saved edit', () => {
  const history = new DraftHistory();
  history.reset(source());
  history.change(document => { document.skills.pop(); document.summaries.default = 'Saved edit.'; });
  const sent = history.current.document;
  const saved = structuredClone(sent);
  saved.snapshot = 1;
  saved.skills[0].lineageId = 'copy-skill-a';
  const checkpoint = history.acceptSaved(sent, saved, true);
  const restored = history.restoreInitial();
  assert.notEqual(restored.id, checkpoint.id, 'resetting saved edits requires Save before exporting');
  assert.equal(restored.document.snapshot, 1);
  assert.equal(restored.document.skills[0].lineageId, 'copy-skill-a');
  assert.notEqual(restored.document.skills[1].lineageId, 'skill-b');
  assert.equal(restored.document.summaries.default, 'Original summary.');
  history.move(-1);
  assert.equal(history.current.id, checkpoint.id);
  assert.equal(history.current.document.summaries.default, 'Saved edit.');
});
