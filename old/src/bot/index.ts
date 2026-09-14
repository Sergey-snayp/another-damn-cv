import { Bot, InlineKeyboard, InputFile } from 'grammy';
import cron from 'node-cron';
import { env, loadSearch } from '../config.js';
import { harvest } from '../pipeline/harvest.js';
import { buildDigest, markDigested, formatJob, formatSingle, formatHeader, esc } from '../pipeline/digest.js';
import { getJob, setStatus, stats, upsertJobs, saveScore, recordResume } from '../store/db.js';
import { tailorResume } from '../resume/tailor.js';
import { formatDiff } from '../resume/diff.js';
import { extractRequirements, analyse, formatAts } from '../resume/ats.js';
import { loadMasterRaw } from '../config.js';
import { renderPdf } from '../resume/render.js';
import { scoreJobs } from '../pipeline/score.js';
import { jobFromUrl } from '../sources/url.js';
import { ingestResume, masterSummary } from '../resume/ingest.js';
import type { ScoredJob } from '../types.js';

if (!env.telegramToken) throw new Error('TELEGRAM_BOT_TOKEN is unset. See .env.example.');
export const bot = new Bot(env.telegramToken);

const OWNER = env.telegramChatId;
const slug = (j: { company: string; title: string }): string =>
  `${j.company}-${j.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const kb = (id: string) => new InlineKeyboard()
  .text('📄 Tailor CV', `tailor:${id}`)
  .text('✅ Applied', `applied:${id}`)
  .text('🚫 Skip', `skip:${id}`);

type EditExtra = Parameters<typeof bot.api.editMessageText>[3];

/**
 * Telegram rejects an edit whose result would be byte-identical to what is
 * already on screen. For a progress message that is a normal race, not a
 * failure, so it is swallowed rather than surfaced as an error to the user.
 */
async function safeEdit(
  chatId: number | string, messageId: number, text: string, extra?: EditExtra,
): Promise<void> {
  try {
    await bot.api.editMessageText(chatId, messageId, text, extra);
  } catch (e) {
    if (!/message is not modified/i.test((e as Error).message)) throw e;
  }
}

const ts = () => new Date().toLocaleTimeString('en-CA', { hour12: false });

/**
 * Log every update before the owner guard runs. Without this, a wrong
 * TELEGRAM_CHAT_ID looks identical to the bot being down: total silence.
 */
bot.use(async (ctx, next) => {
  const id = String(ctx.chat?.id ?? ctx.from?.id ?? '?');
  // grammy has no ctx.updateType; the update's non-id key is the kind.
  const kind = Object.keys(ctx.update).find((k) => k !== 'update_id') ?? 'unknown';
  const what = ctx.message?.text ?? ctx.callbackQuery?.data ?? `<${kind}>`;
  const who = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name ?? 'unknown');

  if (OWNER && id !== OWNER) {
    console.log(`[${ts()}] ✗ dropped "${what}" from ${who} (chat ${id}) — OWNER is ${OWNER}`);
    return;
  }
  console.log(`[${ts()}] → ${who} (chat ${id}): ${what}`);
  const started = Date.now();
  await next();
  console.log(`[${ts()}] ✓ handled in ${Date.now() - started}ms`);
});

/** One list, used for both Telegram's "/" menu and the /help text. */
const COMMANDS = [
  { command: 'today', description: 'Harvest now and send the digest' },
  { command: 'digest', description: "Resend today's picks without re-fetching" },
  { command: 'profile', description: 'Show the Master CV I am using' },
  { command: 'stats', description: 'Pipeline counters' },
  { command: 'help', description: 'Show this list' },
] as const;

const helpText = (chatId: number | string): string =>
  `👋 <b>Job agent</b>\n\nYour chat id is <code>${chatId}</code>.\n\n` +
  COMMANDS.map((c) => `/${c.command} — ${c.description}`).join('\n') +
  `\n\n<b>Paste a job URL</b> (LinkedIn included) — I score it and can tailor a CV.\n` +
  `<b>Send your CV</b> as a PDF or DOCX — it becomes the source for every CV I write.`;

bot.command(['help', 'commands'], (ctx) =>
  ctx.reply(helpText(ctx.chat.id), { parse_mode: 'HTML' }));

bot.command('start', (ctx) =>
  ctx.reply(helpText(ctx.chat.id), { parse_mode: 'HTML' }))

bot.command('profile', (ctx) => {
  const m = masterSummary();
  return ctx.reply(
    `📋 <b>Master CV in use</b>\n\n` +
    `📎 <b>${m.sourceFile ? esc(m.sourceFile) : 'hand-written (not imported)'}</b>\n` +
    (m.importedAt ? `<i>imported ${esc(m.importedAt)}</i>\n` : '') +
    `\n<b>${esc(m.name)}</b>\n${esc(m.headline)}\n\n` +
    `• ${m.roles} roles\n• ${m.skills} skills\n• file updated ${m.updatedAt}\n\n` +
    `Every CV I write draws only on this — I cannot claim anything it does not contain.\n\n` +
    `<b>To replace it:</b> just send me your CV as a PDF or DOCX.\n` +
    (m.backups.length
      ? `<i>${m.backups.length} previous version(s) kept in profile/ if you need to roll back.</i>`
      : ''),
    { parse_mode: 'HTML' });
});

bot.command('stats', (ctx) => {
  const s = stats();
  const lines = Object.entries(s).map(([k, v]) => `${k.padEnd(10)} ${v}`).join('\n');
  return ctx.reply(`<pre>${lines}</pre>`, { parse_mode: 'HTML' });
});

async function sendDigest(chatId: string | number, report?: { fetched: number; kept: number }): Promise<void> {
  const jobs = buildDigest();
  await bot.api.sendMessage(chatId, formatHeader(jobs.length, report), { parse_mode: 'HTML' });
  for (const [i, j] of jobs.entries()) {
    await bot.api.sendMessage(chatId, formatJob(j, i + 1, jobs.length), {
      parse_mode: 'HTML', reply_markup: kb(j.id),
      link_preview_options: { is_disabled: true },
    });
  }
  markDigested(jobs);
}

bot.command('digest', (ctx) => sendDigest(ctx.chat.id));

bot.command('today', async (ctx) => {
  const status = await ctx.reply('🔍 Harvesting…');
  const lines: string[] = [];
  const report = await harvest((m) => { lines.push(m); });
  if (report.errors.length) lines.push(`⚠️ ${report.errors.length} board(s) failed`);
  await ctx.api.editMessageText(ctx.chat.id, status.message_id, `<pre>${lines.join('\n')}</pre>`,
    { parse_mode: 'HTML' });
  await sendDigest(ctx.chat.id, report);
});

// --- resume generation ------------------------------------------------------
async function doTailor(chatId: number | string, job: ScoredJob, notify: (s: string) => Promise<unknown>): Promise<void> {
  await notify('✍️ Tailoring your CV…');
  const { content, issues, recommendations, diff } = await tailorResume(job);

  await notify('📐 Compiling PDF…');
  const { pdfPath, texPath } = await renderPdf(content, slug(job));
  recordResume(job.id, pdfPath, texPath, content);
  setStatus(job.id, 'tailored');

  const covered = content.keywordsCovered.slice(0, 8).join(', ');
  const warn = issues.length
    ? `\n\n⚠️ <b>Verification flagged ${issues.length}:</b>\n` +
      issues.map((i) => `• ${i.detail}`).join('\n') +
      `\n<i>Review before sending — these may be fabrications.</i>`
    : '\n\n✅ Verified: every claim traces back to your master profile.';

  // Telegram caps document captions at 1024 characters.
  const caption = `<b>${job.title}</b> @ ${job.company}\n\n🎯 ${covered}${warn}`;
  await bot.api.sendDocument(chatId, new InputFile(pdfPath),
    { caption: caption.slice(0, 1024), parse_mode: 'HTML' });

  await bot.api.sendMessage(chatId, formatDiff(diff).slice(0, 4000), { parse_mode: 'HTML' });

  await notify('🎯 Running the screening simulation…');
  try {
    const req = await extractRequirements(job);
    const report = analyse(content, req, loadMasterRaw(), pdfPath);
    await bot.api.sendMessage(chatId, formatAts(report).slice(0, 4000), { parse_mode: 'HTML' });
  } catch (e) {
    console.error('ats failed:', (e as Error).message);
  }

  if (recommendations.length) {
    await bot.api.sendMessage(chatId,
      `💡 <b>Before you apply</b>\n\n${recommendations.map((r) => `• ${r}`).join('\n\n')}`.slice(0, 4000),
      { parse_mode: 'HTML' });
  }
}

bot.callbackQuery(/^tailor:(.+)$/, async (ctx) => {
  const id = ctx.match[1]!;
  const job = getJob(id);
  await ctx.answerCallbackQuery();
  if (!job) return void ctx.reply('That job is no longer in the database.');
  const msg = await ctx.reply(`📄 ${job.title} @ ${job.company}`);
  const notify = (s: string) => safeEdit(ctx.chat!.id, msg.message_id, s);
  try {
    await doTailor(ctx.chat!.id, job, notify);
    await notify('✅ Done — CV and notes below.');
  } catch (e) {
    await notify(`❌ ${(e as Error).message.slice(0, 500)}`);
  }
});

bot.callbackQuery(/^(applied|skip):(.+)$/, async (ctx) => {
  const [, action, id] = ctx.match;
  setStatus(id!, action === 'applied' ? 'applied' : 'skipped');
  await ctx.answerCallbackQuery({ text: action === 'applied' ? '✅ Marked applied' : '🚫 Skipped' });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });
});

// --- upload a resume --------------------------------------------------------
bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  const name = doc.file_name ?? 'resume.pdf';

  if (!/\.(pdf|docx|txt|md|ya?ml)$/i.test(name)) {
    return void ctx.reply(`I can read PDF, DOCX, TXT and MD. "${name}" is none of those.`);
  }
  // Telegram's bot API refuses to serve files above 20MB.
  if ((doc.file_size ?? 0) > 20 * 1024 * 1024) {
    return void ctx.reply('That file is over 20MB, which Telegram will not let me download.');
  }

  const msg = await ctx.reply(`📄 Reading <b>${name}</b>…`, { parse_mode: 'HTML' });
  const edit = (s: string) => safeEdit(ctx.chat.id, msg.message_id, s, { parse_mode: 'HTML' });

  try {
    const file = await ctx.getFile();
    if (!file.file_path) throw new Error('Telegram did not return a download path for that file.');
    const res = await fetch(`https://api.telegram.org/file/bot${env.telegramToken}/${file.file_path}`);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    await edit('🧠 Structuring it into your master profile…');
    const { summary, backup, lostSkills } = await ingestResume(buf, name);

    await edit(
      `✅ <b>Master CV replaced</b>\n\n` +
      `📎 <b>${esc(summary.sourceFile)}</b>\n\n` +
      `<b>${esc(summary.name)}</b>\n${esc(summary.headline)}\n\n` +
      `• ${summary.roles} roles\n` +
      `• ${summary.skills} skills\n` +
      `• ${summary.chars.toLocaleString()} characters read\n\n` +
      `Every CV I write from now on draws only on this — I cannot claim anything it does not contain.\n\n` +
      (lostSkills.length
        ? `⚠️ <b>${lostSkills.length} skill(s) present before are missing now:</b>\n` +
          `<i>${esc(lostSkills.slice(0, 20).join(', '))}` +
          `${lostSkills.length > 20 ? `, +${lostSkills.length - 20} more` : ''}</i>\n` +
          `Add them back in profile/master.yaml if they matter.\n\n`
        : '') +
      (backup ? `<i>Previous profile saved as ${backup.split('/').pop()}</i>\n\n` : '\n') +
      `Now paste a job URL, or hit 📄 Tailor CV on any job in the digest.`);
  } catch (e) {
    await edit(`❌ ${(e as Error).message.slice(0, 600)}`);
  }
});

// --- paste a URL ------------------------------------------------------------
bot.on('message:text', async (ctx) => {
  const url = ctx.message.text.trim().match(/https?:\/\/\S+/)?.[0];
  if (!url) return;
  const msg = await ctx.reply('🔗 Fetching posting…');
  // parse_mode matters: without it Telegram prints the tags literally.
  const edit = (s: string) => safeEdit(ctx.chat.id, msg.message_id, s,
    { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  try {
    const raw = await jobFromUrl(url);
    if (raw.description.length < 400) {
      return void edit('⚠️ That page is mostly JavaScript, so I got almost no text.\n' +
        'Copy the job description and paste it here as plain text instead.');
    }
    upsertJobs([raw]);
    await edit('🎯 Scoring…');
    const [scored] = await scoreJobs([raw]);
    if (scored) saveScore(scored);
    const job = getJob(raw.id)!;
    await edit(formatSingle(job).slice(0, 3900));
    await ctx.api.editMessageReplyMarkup(ctx.chat.id, msg.message_id, { reply_markup: kb(job.id) });
  } catch (e) {
    await edit(`❌ ${esc((e as Error).message.slice(0, 400))}`);
  }
});

bot.catch((err) => console.error('bot error:', err.message));

export function startScheduler(): void {
  const { digest_hour } = loadSearch();
  cron.schedule(`0 ${digest_hour} * * 1-5`, async () => {
    console.log(`[cron] daily run at ${new Date().toISOString()}`);
    try {
      const report = await harvest();
      if (OWNER) await sendDigest(OWNER, report);
    } catch (e) { console.error('[cron] failed:', (e as Error).message); }
  }, { timezone: env.tz });
  console.log(`Scheduled: weekdays ${digest_hour}:00 ${env.tz}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startScheduler();
  void bot.start({
    onStart: async () => {
      // Populates the blue "/" menu in the Telegram client.
      await bot.api.setMyCommands([...COMMANDS]);
      console.log(`Bot running (${COMMANDS.length} commands registered). Send /start in Telegram.`);
    },
  });
}
