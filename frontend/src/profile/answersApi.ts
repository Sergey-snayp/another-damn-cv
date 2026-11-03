import { UnauthorizedError } from "../api";

/** An answer you saved from an application form, used by the extension's Autofill. */
export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  company: string | null;
  usedCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api/answers${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

export const answersApi = {
  list: async () => (await call("")).json() as Promise<SavedAnswer[]>,
  update: async (id: string, answer: string) =>
    (await call(`/${id}`, { method: "PATCH", body: JSON.stringify({ answer }) })).json() as Promise<SavedAnswer>,
  remove: async (id: string) => {
    await call(`/${id}`, { method: "DELETE" });
  },
};
