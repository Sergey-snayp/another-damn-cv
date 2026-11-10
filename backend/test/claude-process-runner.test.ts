import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { ServiceUnavailableException } from '@nestjs/common';
import { ClaudeProcessRunner, type ClaudeLaunchOptions } from '../src/shared/ai/claude-process.runner';
import { config } from '../src/shared/config/config';

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly signals: Array<NodeJS.Signals | number | undefined> = [];
  input = '';
  closed = false;
  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => {
      this.input += chunk.toString();
    });
  }
  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(signal);
    queueMicrotask(() => this.close(null));
    return true;
  }
  close(code: number | null): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', code);
  }
}
class FakeRunner extends ClaudeProcessRunner {
  readonly launches: Array<{ command: string; args: string[]; options: ClaudeLaunchOptions }> = [];
  launchError = false;
  constructor(private readonly children: FakeChild[]) {
    super();
  }
  protected override launch(
    command: string,
    args: string[],
    options: ClaudeLaunchOptions,
  ): ChildProcessWithoutNullStreams {
    this.launches.push({ command, args, options });
    if (this.launchError) throw new Error('Synthetic synchronous launch failure');
    const child = this.children.shift();
    assert.ok(child, 'The fake launcher has no child left.');
    return child as unknown as ChildProcessWithoutNullStreams;
  }
}
function fixture(context: TestContext, children: FakeChild[]) {
  const runner = new FakeRunner([...children]);
  context.after(async () => {
    for (const child of children) child.close(0);
    await runner.onModuleDestroy();
  });
  return runner;
}
function unavailable(message: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ServiceUnavailableException);
    assert.equal(error.getStatus(), 503);
    assert.deepEqual(error.getResponse(), { message, error: 'Service Unavailable', statusCode: 503 });
    return true;
  };
}

test('the runner preserves CLI arguments, isolated cwd, environment allowlist, stdin and trimmed output', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const child = new FakeChild(),
    runner = fixture(context, [child]);
  const result = runner.complete('Candidate text\nwith exact spacing.', 'Exact system prompt');
  const launched = runner.launches[0];
  assert.equal(launched.command, config.claudeBin);
  assert.deepEqual(launched.args, [
    '-p',
    '--output-format',
    'text',
    '--model',
    config.llmModel,
    '--strict-mcp-config',
    '--disallowed-tools',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebFetch',
    'WebSearch',
    'NotebookEdit',
    'Task',
    '--exclude-dynamic-system-prompt-sections',
    '--system-prompt',
    'Exact system prompt',
    '--restricted',
    '--tools',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--no-chrome',
  ]);
  assert.deepEqual(launched.options.stdio, ['pipe', 'pipe', 'pipe']);
  assert.deepEqual(readdirSync(launched.options.cwd), []);
  const allowed = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    '__CF_USER_TEXT_ENCODING',
    'CLAUDE_CODE_OAUTH_TOKEN',
  ];
  assert.deepEqual(
    Object.keys(launched.options.env).sort(),
    allowed.filter((key) => process.env[key] !== undefined).sort(),
  );
  assert.ok(!('DATABASE_URL' in launched.options.env));
  assert.ok(!('SESSION_SECRET' in launched.options.env));
  assert.equal(child.input, 'Candidate text\nwith exact spacing.');
  child.stdout.write('  first\n');
  child.stdout.write('second  ');
  child.close(0);
  assert.equal(await result, 'first\nsecond');
  context.mock.timers.tick(180_000);
  assert.deepEqual(child.signals, [], 'A completed process must have no remaining timeout.');
  const cwd = launched.options.cwd;
  writeFileSync(join(cwd, 'synthetic-cli-file'), 'Only test data.');
  await runner.onModuleDestroy();
  assert.equal(existsSync(cwd), false);
});

test('with onText the answer streams: each piece of text as it comes, then the whole answer', async (context) => {
  const child = new FakeChild(),
    runner = fixture(context, [child]);
  const seen: string[] = [];
  const result = runner.complete('prompt', 'system', { onText: (soFar) => seen.push(soFar) });
  const args = runner.launches[0].args;
  assert.deepEqual(args.slice(1, 5), [
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ]);
  const delta = (text: string) =>
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    });
  // An event split across chunks, one that is not JSON, and one with no text are all read safely.
  const first = delta('<summary>Built');
  child.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init' })}\n${first.slice(0, 20)}`);
  child.stdout.write(`${first.slice(20)}\nnot json\n${delta(' APIs.')}\n`);
  child.stdout.write(`${JSON.stringify({ type: 'result', result: '<summary>Built APIs.</summary>' })}\n`);
  child.close(0);
  assert.equal(await result, '<summary>Built APIs.</summary>');
  assert.deepEqual(seen, ['<summary>Built', '<summary>Built APIs.']);
});

test('spawn errors and synchronous launch failures keep the existing unavailable response', async (context) => {
  for (const synchronous of [false, true]) {
    const child = new FakeChild(),
      runner = fixture(context, [child]);
    runner.launchError = synchronous;
    const failure = assert.rejects(
      runner.complete('text', 'system'),
      unavailable(`Cannot run "${config.claudeBin}". Set CLAUDE_BIN in .env.`),
    );
    if (!synchronous) child.emit('error', new Error('Synthetic ENOENT'));
    await failure;
    await runner.onModuleDestroy();
    assert.equal(existsSync(runner.launches[0].options.cwd), false);
  }
});

test('every call is prompt only: no tools or saved session, without disabling local sign-in', async (context) => {
  const child = new FakeChild(),
    runner = fixture(context, [child]);
  const response = runner.complete('private candidate data', 'coach', { model: 'practice-model' });
  const args = runner.launches[0].args;
  for (const flag of ['--restricted', '--disable-slash-commands', '--no-session-persistence', '--no-chrome'])
    assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(args[args.indexOf('--model') + 1], 'practice-model');
  assert.ok(!args.includes('--bare'));
  child.stdout.write('answer');
  child.close(0);
  assert.equal(await response, 'answer');
});

test("effort is the model's own default unless a call asks for one", async (context) => {
  const first = new FakeChild(),
    second = new FakeChild(),
    runner = fixture(context, [first, second]);
  const plain = runner.complete('line', 'system');
  const quick = runner.complete('line', 'system', { effort: 'low' });
  assert.ok(!runner.launches[0].args.includes('--effort'));
  const args = runner.launches[1].args;
  assert.equal(args[args.indexOf('--effort') + 1], 'low');
  for (const child of [first, second]) {
    child.stdout.write('ok');
    child.close(0);
  }
  assert.deepEqual(await Promise.all([plain, quick]), ['ok', 'ok']);
});

test('an oversized practice response kills only its own child and leaves another request running', async (context) => {
  const first = new FakeChild(),
    second = new FakeChild(),
    runner = fixture(context, [first, second]);
  const failure = assert.rejects(runner.complete('first', 'coach', { maxOutputChars: 10 }), /too large/);
  const success = runner.complete('second', 'coach');
  first.stdout.write('x'.repeat(11));
  await failure;
  assert.deepEqual(first.signals, ['SIGKILL']);
  assert.deepEqual(second.signals, []);
  second.stdout.write('ok');
  second.close(0);
  assert.equal(await success, 'ok');
});

test('nonzero exits retain stderr truncation/fallback and not-signed-in detection', async (context) => {
  const cases = [
    { code: 7, stdout: '', stderr: 'x'.repeat(250), message: 'x'.repeat(200) },
    { code: 23, stdout: '', stderr: '', message: 'exit 23' },
    {
      code: 0,
      stdout: 'Not logged in. Please sign in.',
      stderr: '',
      message: 'The Claude CLI is not signed in.',
    },
  ];
  for (const row of cases) {
    const child = new FakeChild(),
      runner = fixture(context, [child]);
    const result = assert.rejects(runner.complete('text', 'system'), unavailable(row.message));
    child.stdout.write(row.stdout);
    child.stderr.write(row.stderr);
    child.close(row.code);
    await result;
  }
});

test('default and requested timeouts kill their own process with SIGKILL and preserve the timeout error', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = new FakeChild(),
    second = new FakeChild(),
    runner = fixture(context, [first, second]);
  const message = 'The AI took too long to answer. Try again.';
  const defaults = assert.rejects(runner.complete('first', 'system'), unavailable(message));
  const custom = assert.rejects(runner.complete('second', 'system', { timeoutMs: 12 }), unavailable(message));
  context.mock.timers.tick(11);
  assert.deepEqual(first.signals, []);
  assert.deepEqual(second.signals, []);
  context.mock.timers.tick(1);
  await custom;
  assert.deepEqual(second.signals, ['SIGKILL']);
  assert.deepEqual(first.signals, []);
  context.mock.timers.tick(180_000 - 12);
  await defaults;
  assert.deepEqual(first.signals, ['SIGKILL']);
});

test('an early stdin close does not crash the process or hide its useful exit error', async (context) => {
  const child = new FakeChild(),
    runner = fixture(context, [child]);
  const result = assert.rejects(
    runner.complete('A long prompt', 'system'),
    unavailable('Synthetic provider failure'),
  );
  child.stdin.emit('error', new Error('Synthetic EPIPE'));
  child.stderr.write('Synthetic provider failure');
  child.close(1);
  await result;
});

test('shutdown waits for active calls before deleting their directory and prevents later launches', async (context) => {
  const child = new FakeChild(),
    runner = fixture(context, [child]);
  const result = runner.complete('text', 'system');
  const cwd = runner.launches[0].options.cwd;
  const shutdown = runner.onModuleDestroy();
  await Promise.resolve();
  assert.equal(existsSync(cwd), true);
  await assert.rejects(
    runner.complete('too late', 'system'),
    unavailable(`Cannot run "${config.claudeBin}". Set CLAUDE_BIN in .env.`),
  );
  assert.equal(runner.launches.length, 1);
  child.stdout.write('Finished active call.');
  child.close(0);
  assert.equal(await result, 'Finished active call.');
  await shutdown;
  assert.equal(existsSync(cwd), false);
});
