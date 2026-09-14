import { getLlm, extractJson } from '../llm/index.js';

/**
 * A minimal agent runtime.
 *
 * The whole idea fits in one sentence: instead of the programmer writing the
 * sequence of steps, the model chooses the next step from a menu of tools, sees
 * what happened, and chooses again — until it decides it is done or runs out of
 * budget. Everything else in this file is the infrastructure that makes that
 * safe to run unattended.
 */

export interface Tool<A = Record<string, unknown>, R = unknown> {
  name: string;
  /** Shown to the model. This is the API contract — vague wording, wrong calls. */
  description: string;
  /** Argument name → what it means. */
  args: Record<string, string>;
  run(args: A): Promise<R>;
}

export interface AgentStep {
  n: number;
  thought: string;
  tool: string;
  args: unknown;
  result: unknown;
  ms: number;
  ok: boolean;
}

export interface AgentRun {
  steps: AgentStep[];
  answer: string;
  stopped: 'done' | 'max_steps' | 'timeout';
}

export interface AgentOptions {
  goal: string;
  tools: Tool[];
  /** Hard ceiling on tool calls. An agent without one can loop forever. */
  maxSteps?: number;
  /** Wall-clock ceiling, for when each step is slow rather than numerous. */
  maxSeconds?: number;
  onStep?: (s: AgentStep) => void;
}

interface Action {
  thought?: string;
  tool?: string;
  args?: Record<string, unknown>;
  done?: boolean;
  answer?: string;
}

/** Observations re-enter the prompt every turn, so they must stay small. */
const trim = (v: unknown, max = 1200): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}… [truncated]` : s;
};

function catalogue(tools: Tool[]): string {
  return tools.map((t) => {
    const args = Object.entries(t.args).map(([k, v]) => `      ${k}: ${v}`).join('\n');
    return `- ${t.name}: ${t.description}\n    args:\n${args}`;
  }).join('\n');
}

export async function runAgent(opts: AgentOptions): Promise<AgentRun> {
  const { goal, tools, maxSteps = 20, maxSeconds = 300, onStep } = opts;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const llm = getLlm();
  const deadline = Date.now() + maxSeconds * 1000;

  const system = `You are an autonomous agent. You achieve a goal by calling tools one at a time.

TOOLS
${catalogue(tools)}

PROTOCOL — reply with ONE JSON object per turn and nothing else:
  to act:     {"thought":"why this call","tool":"<name>","args":{...}}
  to finish:  {"thought":"why you are done","done":true,"answer":"<what you achieved>"}

RULES
- One tool call per turn. You will be shown the result before choosing again.
- A tool returning an error is information, not failure: adapt and try something else.
- Do not repeat a call that already failed with the same arguments.
- Stop as soon as the goal is met. Do not pad the run with extra calls.`;

  const transcript: string[] = [];
  const steps: AgentStep[] = [];

  for (let n = 1; n <= maxSteps; n++) {
    if (Date.now() > deadline) {
      return { steps, answer: 'Stopped: time budget exhausted.', stopped: 'timeout' };
    }

    const prompt = `GOAL: ${goal}

${transcript.length ? `WHAT HAS HAPPENED SO FAR:\n${transcript.join('\n')}` : 'Nothing has happened yet.'}

Step ${n} of at most ${maxSteps}. Reply with a single JSON object.`;

    let action: Action;
    try {
      action = extractJson<Action>(await llm.complete(prompt, { system, maxTokens: 900 }));
    } catch (e) {
      // Malformed output is recoverable: tell the model and let it retry.
      transcript.push(`[step ${n}] your reply was not valid JSON (${(e as Error).message}). Reply with one JSON object.`);
      continue;
    }

    if (action.done) {
      return { steps, answer: action.answer ?? 'Done.', stopped: 'done' };
    }

    const tool = action.tool ? byName.get(action.tool) : undefined;
    if (!tool) {
      transcript.push(`[step ${n}] no such tool "${action.tool}". Available: ${[...byName.keys()].join(', ')}`);
      continue;
    }

    const started = Date.now();
    let result: unknown;
    let ok = true;
    try {
      result = await tool.run((action.args ?? {}) as never);
    } catch (e) {
      // Tool failures are fed back as observations. An agent that crashes on the
      // first 404 is useless; the point is that it adapts.
      ok = false;
      result = { error: (e as Error).message };
    }

    const step: AgentStep = {
      n, thought: action.thought ?? '', tool: tool.name,
      args: action.args ?? {}, result, ms: Date.now() - started, ok,
    };
    steps.push(step);
    onStep?.(step);

    transcript.push(
      `[step ${n}] ${tool.name}(${trim(action.args ?? {}, 200)}) → ${trim(result)}`);
  }

  return { steps, answer: `Stopped after ${maxSteps} steps without finishing.`, stopped: 'max_steps' };
}
