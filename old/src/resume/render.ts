import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { env, loadMasterRaw } from '../config.js';
import type { TailoredResume } from '../types.js';

const exec = promisify(execFile);

/** LaTeX will happily compile garbage from unescaped input; escape everything. */
export function tex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/"/g, "''")
    .replace(/–|—/g, '--');
}

interface Identity { name: string; email: string; location: string;
  github?: string; linkedin?: string; website?: string }

interface Education { school?: string; degree?: string; start?: number | string; end?: number | string }
type Language = { name?: string; level?: string } | string;

export function buildTex(r: TailoredResume): string {
  const master = parse(loadMasterRaw()) as {
    identity: Identity; education?: Education[]; languages?: Language[] };
  const id = master.identity;

  const contact = [
    tex(id.email), tex(id.location),
    id.linkedin ? `\\href{${id.linkedin}}{LinkedIn}` : '',
    id.github ? `\\href{${id.github}}{GitHub}` : '',
    id.website ? `\\href{${id.website}}{${tex(id.website.replace(/^https?:\/\//, ''))}}` : '',
  ].filter(Boolean).join(' \\textbar{} ');

  const skills = r.skillGroups
    .filter((g) => g.items.length > 0)
    .map((g) => `\\skillrow{${tex(g.label)}}{${tex(g.items.join(', '))}}`)
    .join('\n');

  const experience = r.experience.map((e) => {
    const bullets = e.bullets.map((b) => `  \\item ${tex(b)}`).join('\n');
    const context = e.context ? `\\jobcontext{${tex(e.context)}}\n` : '';
    return `\\jobheading{${tex(e.company)}}{${tex(e.title)}}{${tex(e.dates)}}
${context}\\begin{itemize}[leftmargin=1.2em,itemsep=1pt,topsep=2pt,parsep=0pt]
${bullets}
\\end{itemize}`;
  }).join('\n\n');

  // A profile rebuilt from an upload may omit these or shape them differently;
  // a missing section should thin the PDF, never break the compile.
  const education = (master.education ?? [])
    .map((e) => {
      const years = [e.start, e.end].filter((v) => v != null).join('--');
      return `\\jobheading{${tex(e.school ?? '')}}{${tex(e.degree ?? '')}}{${tex(years)}}`;
    })
    .join('\n');

  const langs = (master.languages ?? [])
    .map((l) => (typeof l === 'string' ? tex(l) : `${tex(l.name ?? '')}: ${tex(l.level ?? '')}`))
    .filter((s) => s.replace(/[:\s]/g, '').length > 0)
    .join(' \\textbar{} ');

  return `\\documentclass[10.5pt,letterpaper]{article}
\\usepackage[margin=0.6in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{charter}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{titlesec}
\\usepackage{xcolor}

\\definecolor{accent}{HTML}{1A3A5C}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\titleformat{\\section}{\\large\\bfseries\\color{accent}}{}{0em}{}[\\vspace{-0.7em}\\rule{\\linewidth}{0.6pt}]
\\titlespacing{\\section}{0pt}{9pt}{5pt}

\\newcommand{\\jobheading}[3]{%
  \\vspace{3pt}\\textbf{#1} \\textbar{} #2 \\hfill \\textit{\\small #3}\\par\\vspace{1pt}}
\\newcommand{\\jobcontext}[1]{{\\small\\itshape #1}\\par\\vspace{2pt}}
\\newcommand{\\skillrow}[2]{\\textbf{#1:} #2\\par\\vspace{1.5pt}}

\\begin{document}

\\begin{center}
  {\\LARGE\\bfseries ${tex(id.name)}}\\\\[3pt]
  {\\color{accent}${tex(r.headline)}}\\\\[4pt]
  {\\small ${contact}}
\\end{center}
\\vspace{2pt}

\\section*{Summary}
${tex(r.summary)}

\\section*{Skills}
${skills}

\\section*{Experience}
${experience}

\\section*{Education}
${education}

\\section*{Languages}
${langs}

\\end{document}
`;
}

export interface RenderResult { texPath: string; pdfPath: string }

export async function renderPdf(r: TailoredResume, slug: string): Promise<RenderResult> {
  mkdirSync(env.outDir, { recursive: true });
  const texPath = join(env.outDir, `${slug}.tex`);
  const pdfPath = join(env.outDir, `${slug}.pdf`);
  writeFileSync(texPath, buildTex(r), 'utf8');

  try {
    await exec(env.tectonicBin, ['-X', 'compile', texPath, '--outdir', env.outDir, '--keep-logs'],
      // Generous: a cold tectonic cache downloads its whole font/package set
      // on the first compile. Warm runs finish in a couple of seconds.
      { timeout: 600_000 });
  } catch (e) {
    const msg = (e as { stderr?: string; message: string }).stderr ?? (e as Error).message;
    throw new Error(
      `LaTeX compile failed. Is tectonic runnable at "${env.tectonicBin}"? ` +
      `Set TECTONIC_BIN to its absolute path if it isn't on PATH.\n${msg.slice(-1200)}`);
  }
  if (!existsSync(pdfPath)) throw new Error(`tectonic reported success but ${pdfPath} is missing`);
  return { texPath, pdfPath };
}
