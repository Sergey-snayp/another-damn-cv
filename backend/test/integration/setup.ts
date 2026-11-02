/**
 * A real Postgres for integration tests: the `cv_test` database next to the dev
 * one, brought up to date with the migrations before each run.
 *
 * Nothing is ever deleted. Every test creates its own users with unique ids, so
 * rows left by earlier runs cannot affect it.
 *
 * Import this first in an integration test. It points DATABASE_URL at the test
 * database before anything reads the config, and refuses to run against a
 * database whose name does not end in `_test`.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/shared/database/prisma.service';

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) to reach Postgres.');
  const url = new URL(dev);
  url.pathname = '/cv_test';
  return url.toString();
}

const url = testDatabaseUrl();
const name = new URL(url).pathname.slice(1);
if (!name.endsWith('_test')) {
  throw new Error(`Refusing to use "${name}": integration tests only run against a *_test database.`);
}
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET ??= 'integration-test-secret';

/** Creates the test database if needed and applies any pending migrations. */
export function migrateTestDatabase(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}

export const prisma = new PrismaService();

/** A signed-up user with a profile, as after a first Google sign-in. */
export async function createUser(name = 'Test User') {
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { googleId: `google-${tag}`, email: `${tag}@example.com`, name },
  });
  const profile = await prisma.profile.create({
    data: { userId: user.id, firstName: name, lastName: '', email: user.email },
  });
  return { user, profile };
}
