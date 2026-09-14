/** Thin wrapper so every call goes through the Vite proxy in dev. */
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export interface FactBaseStats {
  skills: number;
  skillsVerified: number;
  projects: number;
  achievements: number;
  achievementsVerified: number;
  updatedAt?: string;
}

export const api = {
  stats: () => get<FactBaseStats>('/factbase/stats'),
};
