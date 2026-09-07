import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCompanies, env } from './config.js';
import { harvest } from './pipeline/harvest.js';
import { buildDigest, formatJob, formatHeader } from './pipeline/digest.js';
import { detectAts } from './sources/ats.js';
import { stats, getJob, upsertJobs, saveScore, recordResume, setStatus } from './store/db.js';
import { scoreJobs } from './pipeline/score.js';
import { tailorResume } from './resume/tailor.js';
import { formatDiff } from './resume/diff.js';
import { extractRequirements, analyse, formatAts } from './resume/ats.js';
import { loadMasterRaw } from './config.js';
import { renderPdf } from './resume/render.js';
import { jobFromUrl } from './sources/url.js';
import { ingestResume } from './resume/ingest.js';
import { readFileSync as readBin } from 'node:fs';
import { basename } from 'node:path';

const strip = (s: string) => s.replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

async function cmdDiscover(): Promise<void> {
  const companies = loadCompanies();
  console.log(`Probing ${companies.length} tokens across Greenhouse / Lever / Ashby…\n`);
  const resolved: string[] = [];
  for (const c of companies) {
    const hit = await detectAts(c.token);
    if (hit) {
      resolved.push(`  - { token: ${c.token}, name: ${c.name}, ats: ${hit.ats} }`);
      console.log(`  ✓ ${c.name.padEnd(16)} ${hit.ats.padEnd(11)} ${hit.count} jobs`);
    } else {
      console.log(`  ✗ ${c.name.padEnd(16)} no public board found`);
    }
  }
  const path = join(ROOT, 'profile/companies.yaml');
  const header = readFileSync(path, 'utf8').split('companies:')[0];
  writeFileSync(path, `${header}companies:\n${resolved.join('\n')}\n`, 'utf8');
  console.log(`\nWrote ${resolved.length} live boards to profile/companies.yaml`);
}

async function cmdTailor(target: string): Promise<void> {
  let job = getJob(target);
  if (!job && /^https?:\/\//.test(target)) {
    console.log('Fetching posting…');
    const raw = await jobFromUrl(target);
    upsertJobs([raw]);
    const [s] = await scoreJobs([raw]);
    if (s) saveScore(s);
    job = getJob(raw.id);
  }
  if (!job) throw new Error(`No job found for "${target}" — pass a job id or a URL.`);

  console.log(`Tailoring for: ${job.title} @ ${job.company}`);
  const { content, issues, recommendations, diff } = await tailorResume(job);
  const slug = `${job.company}-${job.title}`.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const { pdfPath, texPath } = await renderPdf(content, slug);
  recordResume(job.id, pdfPath, texPath, content);
  setStatus(job.id, 'tailored');

  console.log(`\n✅ ${pdfPath}`);
  console.log(`   keywords: ${content.keywordsCovered.join(', ')}`);
  if (issues.length) {
    console.log(`\n⚠️  Verification flagged ${issues.length} item(s):`);
    for (const i of issues) console.log(`   [${i.kind}] ${i.detail}`);
  } else {
    console.log('   ✓ verified — every claim traces to your master profile');
  }
  console.log(`\n${strip(formatDiff(diff)).replace(/\n{3,}/g, '\n\n')}`);

  try {
    const req = await extractRequirements(job);
    console.log(`\n${strip(formatAts(analyse(content, req, loadMasterRaw(), pdfPath)))}`);
  } catch (e) {
    console.log(`\n(screening simulation failed: ${(e as Error).message})`);
  }

  if (recommendations.length) {
    console.log('\n💡 Before you apply:');
    for (const r of recommendations) console.log(`   • ${r}`);
  }
}

async function cmdProfile(path: string): Promise<void> {
  console.log(`Reading ${path}…`);
  const { summary, backup, lostSkills } = await ingestResume(readBin(path), basename(path));
  console.log(`\n✅ profile/master.yaml updated`);
  console.log(`   source: ${summary.sourceFile}`);
  console.log(`   ${summary.name} — ${summary.headline}`);
  console.log(`   ${summary.roles} roles, ${summary.skills} skills, ${summary.chars} chars read`);
  if (backup) console.log(`   previous profile kept at ${basename(backup)}`);
  if (lostSkills.length) {
    console.log(`\n⚠️  ${lostSkills.length} skill(s) present before are missing now:`);
    console.log(`   ${lostSkills.join(', ')}`);
  }
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'harvest': {
      const r = await harvest();
      console.log(`\nfetched=${r.fetched} new=${r.fresh} kept=${r.kept} scored=${r.scored}`);
      if (Object.keys(r.rejectionReasons).length) {
        console.log('rejections:', Object.entries(r.rejectionReasons)
          .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
      }
      for (const e of r.errors) console.log(`  ⚠️  ${e}`);
      break;
    }
    case 'digest': {
      const jobs = buildDigest();
      console.log(strip(formatHeader(jobs.length)));
      jobs.forEach((j, i) => console.log(`\n${'─'.repeat(60)}\n${strip(formatJob(j, i + 1, jobs.length))}`));
      break;
    }
    case 'tailor':
      if (!arg) throw new Error('usage: npm run tailor -- <job-id|url>');
      await cmdTailor(arg);
      break;
    case 'profile':
      if (!arg) throw new Error('usage: npm run profile -- <resume.pdf|docx|txt>');
      await cmdProfile(arg);
      break;
    case 'discover': await cmdDiscover(); break;
    case 'stats':
      console.log(Object.entries(stats()).map(([k, v]) => `${k.padEnd(10)} ${v}`).join('\n'));
      break;
    default:
      console.log(`job-agent — commands:
  harvest              fetch every board, filter, score
  digest               print today's picks
  tailor <id|url>      generate a tailored PDF + application advice
  profile <file>       rebuild master.yaml from a resume (PDF/DOCX/TXT)
  discover             probe company tokens and rewrite companies.yaml
  stats                pipeline counters

LLM provider: ${env.llmProvider}   model: ${env.model}`);
  }
}

main().catch((e) => { console.error(`\n❌ ${(e as Error).message}`); process.exit(1); });
