/** Short ids are part of the model protocol, not resume identity. */
export interface PromptIds {
  roles: Map<string, string>;
  bullets: Map<string, { lineageId: string; experienceLineageId: string }>;
  skills: Map<string, string>;
}
