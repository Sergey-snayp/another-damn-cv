import { createContext, useContext } from "react";

/** The bullet being written or edited on the Profile, for the panel that checks it. */
export interface ActiveBullet {
  /** A job's bullet (the default), the professional summary or a job's description: each has its own checks. */
  kind?: "bullet" | "summary" | "description";
  /** For a description: the job's title, company and client, which it should not repeat. */
  title?: string;
  company?: string;
  client?: string;
  text: string;
  /** The job's technologies: what "Keywords" looks for. */
  keywords: string[];
  /** "Senior Software Engineer · Ciklum" */
  job: string;
}

const SetActiveBullet = createContext<(bullet: ActiveBullet | null) => void>(() => {});
export const BulletFocusProvider = SetActiveBullet.Provider;
export const useSetActiveBullet = () => useContext(SetActiveBullet);
