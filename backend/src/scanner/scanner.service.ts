import { Injectable } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoFacts, ScanProposal } from '../shared';
import { config } from '../config';

/**
 * Walks repositories and proposes facts with evidence.
 *
 * Everything it finds enters the base as verified:false. Code cannot tell
 * whether you introduced a dependency or merely worked beside it — only you can.
 *
 * Run it while repository access still exists: the most valuable experience
 * lives in client repos you lose when you leave.
 */
@Injectable()
export class ScannerService {
  listRepos(root = config.scanRoot): string[] {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, '.git')))
      .map((entry) => join(root, entry.name));
  }

  scan(repoPath: string): ScanProposal {
    const facts: RepoFacts = {
      repoPath,
      repoName: repoPath.split('/').pop() ?? repoPath,
      dependencies: [],
      databases: [],
      infrastructure: [],
      testing: [],
      scale: {},
      candidateAchievements: [],
    };

    this.readPackageJson(repoPath, facts);
    this.readGit(repoPath, facts);

    return { facts, proposedSkills: facts.dependencies };
  }

  private readPackageJson(repoPath: string, facts: RepoFacts): void {
    const file = join(repoPath, 'package.json');
    if (!existsSync(file)) return;

    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      facts.dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    } catch {
      // A malformed package.json is not worth failing the whole scan over.
    }
  }

  /**
   * Commit share is the single most valuable fact here, and the one that cannot
   * be faked. Old client repos often have corrupt packfiles, so a git failure
   * degrades the scan rather than aborting it.
   */
  private readGit(repoPath: string, facts: RepoFacts): void {
    try {
      const remote = execFileSync('git', ['-C', repoPath, 'config', '--get', 'remote.origin.url'],
        { encoding: 'utf8' }).trim();
      facts.remote = remote || undefined;

      const shortlog = execFileSync('git', ['-C', repoPath, 'shortlog', '-sn', '--all'],
        { encoding: 'utf8' });

      const rows = shortlog.trim().split('\n')
        .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
        .filter((m): m is RegExpMatchArray => Boolean(m))
        .map((m) => ({ count: Number(m[1]), author: m[2]! }));

      facts.commits = {
        byOwner: 0, // resolved once the owner's git identities are known
        total: rows.reduce((sum, row) => sum + row.count, 0),
      };
    } catch (err) {
      facts.degraded = `git unavailable: ${(err as Error).message.slice(0, 120)}`;
    }
  }
}
