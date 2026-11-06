import type { RenderedResume } from '../resumeApi';

interface Step { id: number; document: RenderedResume }
type Row = { lineageId?: string; experienceLineageId?: string };
const bookkeeping = ['id', 'resumeId', 'createdInSnapshot', 'supersededInSnapshot'];

function rows(document: RenderedResume): Row[] {
  return [
    ...(document.contact ? [document.contact] : []),
    ...document.experiences,
    ...document.experiences.flatMap(role => role.achievements),
    ...document.educations, ...document.skills,
    ...(document.projects ?? []), ...(document.certifications ?? []), ...(document.customSections ?? []),
  ];
}

function withIds(document: RenderedResume) {
  // Explicit empty values let Save clear a field restored by Undo; omitted
  // values would mean "leave the current saved value alone" to the API.
  document.contact = {
    firstName: '', lastName: '', email: '', headline: null, openToRelocation: false,
    phone: null, location: null, linkedin: null, github: null, website: null,
    ...(document.contact ?? {}),
  };
  for (const education of document.educations) {
    education.field ??= null;
    education.to ??= null;
  }
  for (const skill of document.skills) skill.category ??= '';
  for (const row of rows(document)) row.lineageId ??= crypto.randomUUID();
  for (const role of document.experiences)
    for (const bullet of role.achievements) bullet.experienceLineageId = role.lineageId!;
  return document;
}

/** Local edit history. Moving through it never saves a CV or generates a PDF. */
export class DraftHistory {
  private steps: Step[] = [];
  private index = -1;
  private nextId = 0;

  get current() { return this.steps[this.index] ?? null; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index >= 0 && this.index < this.steps.length - 1; }
  get canReset() { return Boolean(this.current && this.current.id !== this.steps[0]?.id); }

  reset(document: RenderedResume) {
    this.steps = [{ id: this.nextId++, document: withIds(structuredClone(document)) }];
    this.index = 0;
    return this.current!;
  }

  change(mutate: (document: RenderedResume) => void) {
    if (!this.current) return null;
    const next = structuredClone(this.current.document);
    mutate(next);
    withIds(next);
    if (JSON.stringify(next) === JSON.stringify(this.current.document)) return null;
    this.steps = [...this.steps.slice(0, this.index + 1), { id: this.nextId++, document: next }];
    this.index++;
    return this.current;
  }

  move(direction: -1 | 1) {
    if (direction < 0 ? !this.canUndo : !this.canRedo) return null;
    this.index += direction;
    return this.current;
  }

  /** Reset is an undoable edit. Reuse the initial state ID for saved-state checks. */
  restoreInitial() {
    const initial = this.steps[0];
    if (!initial || !this.canReset) return null;
    this.steps = [...this.steps.slice(0, this.index + 1), {
      id: initial.id, document: structuredClone(initial.document),
    }];
    this.index++;
    return this.current;
  }

  /** Save may assign new row IDs to a job's copy. Keep every edit tied to that copy. */
  acceptSaved(sent: RenderedResume, saved: RenderedResume, newCopy: boolean) {
    if (!this.current || this.current.document !== sent) return null;
    const ids = new Map<string, string>();
    const savedRows = rows(saved);
    rows(sent).forEach((row, index) => {
      const next = savedRows[index];
      if (row.lineageId && next?.lineageId) ids.set(row.lineageId, next.lineageId);
    });
    const remap = (id: string) => {
      if (!ids.has(id)) ids.set(id, newCopy ? crypto.randomUUID() : id);
      return ids.get(id)!;
    };
    this.steps = this.steps.map(step => {
      const document = structuredClone(step.document);
      document.snapshot = saved.snapshot;
      for (const row of rows(document)) {
        for (const key of bookkeeping) delete (row as Record<string, unknown>)[key];
        if (row.lineageId) row.lineageId = remap(row.lineageId);
        if (row.experienceLineageId) row.experienceLineageId = remap(row.experienceLineageId);
      }
      return { ...step, document };
    });
    this.steps[this.index] = { id: this.current.id, document: withIds(structuredClone(saved)) };
    return this.current;
  }
}
