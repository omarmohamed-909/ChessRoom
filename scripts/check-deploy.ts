import { resolve } from 'node:path';
import { configurationIssues } from '../apps/server/src/config';
for (const file of ['apps/server/.env', 'apps/web/.env.local']) {
  try {
    process.loadEnvFile(resolve(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read ${file}`);
  }
}
const issues = configurationIssues(process.env, true);
try {
  const web = new URL(process.env.NEXT_PUBLIC_SERVER_URL || '');
  if (
    web.protocol !== 'https:' ||
    web.origin !== new URL(process.env.API_ORIGIN || '').origin ||
    web.pathname !== '/' ||
    web.search ||
    web.hash ||
    web.username ||
    web.password
  )
    throw new Error();
} catch {
  issues.push('NEXT_PUBLIC_SERVER_URL must match the HTTPS API_ORIGIN before building the web app');
}
if (issues.length) {
  console.error('Production configuration needs attention (secret values are never printed):');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else
  console.log(
    'Configuration format checks passed. Confirm same-site domains, provider access, database backups and staging tests before deployment.',
  );
