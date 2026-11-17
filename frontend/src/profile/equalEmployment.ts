import type { ContactFields } from "../api";

/** The diversity questions of Jobright's last step, saved on the Profile. Each has a way not to answer. */
export const EEO_QUESTIONS = [
  { key: "eeoDisability", label: "Do you have a disability?", choices: ["Yes", "No", "Prefer not to answer"] },
  { key: "eeoVeteran", label: "Are you a veteran?", choices: ["Yes", "No", "Prefer not to answer"] },
  { key: "eeoGender", label: "What is your gender?", choices: ["Man", "Woman", "Non-binary", "Prefer not to answer"] },
  { key: "eeoLgbtq", label: "Do you identify as LGBTQ+?", choices: ["Yes", "No", "Prefer not to answer"] },
  {
    key: "eeoRace",
    label: "How would you identify your race?",
    choices: [
      "American Indian or Alaska Native",
      "Asian",
      "Black or African American",
      "Hispanic or Latino",
      "Native Hawaiian or Other Pacific Islander",
      "White",
      "Two or more races",
      "Prefer not to answer",
    ],
  },
] as const satisfies readonly { key: keyof ContactFields; label: string; choices: readonly string[] }[];
export type EeoKey = (typeof EEO_QUESTIONS)[number]["key"];

/** An answer as the Profile shows it ("I am not a protected veteran" from an older save reads "No"). */
export function eeoDisplay(key: EeoKey, value: string | undefined): string {
  const text = (value ?? "").trim();
  if (key === "eeoVeteran" && /not a protected veteran/i.test(text)) return "No";
  if (key === "eeoVeteran" && /protected veteran/i.test(text)) return "Yes";
  return text;
}
