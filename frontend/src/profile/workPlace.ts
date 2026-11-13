import type { CareerExperience, WorkType } from "./careerApi";

/** How and where a job was worked, from new saves and older ones. */
export const WORK_TYPE_NAMES: Record<WorkType, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
/** Older saves put "Remote" (or "Hybrid", "On-site") in the location itself. */
const WORK_WORDS: Record<string, WorkType> = { remote: "remote", hybrid: "hybrid", onsite: "onsite", "on-site": "onsite", "on site": "onsite" };

/** How and where, read the same from new and older saves. */
export function workFacts(role: CareerExperience): { workType: WorkType | null; location: string } {
  const word = WORK_WORDS[role.location.trim().toLowerCase()];
  if (role.workType) return { workType: role.workType, location: word ? "" : role.location.trim() };
  return word ? { workType: word, location: "" } : { workType: null, location: role.location.trim() };
}

/** The job's place as one CV line: "Canada (Remote)", "Remote", "Vancouver, Canada". */
export function jobPlace(role: CareerExperience): string {
  const { workType, location } = workFacts(role);
  const how = workType ? WORK_TYPE_NAMES[workType] : "";
  return location && how ? `${location} (${how})` : location || how;
}
