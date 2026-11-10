import { createContext, useContext } from "react";

/** The bullet being written or edited on the Profile, for the panel that checks it. */
export interface ActiveBullet {
  /** A job's bullet (the default) or the professional summary: each has its own checks. */
  kind?: "bullet" | "summary";
  text: string;
  /** The job's technologies: what "Keywords" looks for. */
  keywords: string[];
  /** "Senior Software Engineer · Ciklum" */
  job: string;
}

const SetActiveBullet = createContext<(bullet: ActiveBullet | null) => void>(() => {});
export const BulletFocusProvider = SetActiveBullet.Provider;
export const useSetActiveBullet = () => useContext(SetActiveBullet);
