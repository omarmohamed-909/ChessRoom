type Environment = Record<string, string | undefined>;
export function configurationIssues(
  env: Environment,
  production = env.NODE_ENV === 'production',
): string[] {
  const issues: string[] = [];
  for (const [key, min, max] of [
    ['PORT', 1, 65535],
    ['MAX_ROOMS', 1, 1000],
    ['MAX_CONNECTIONS_PER_IP', 1, 10000],
    ['TRUST_PROXY', 0, 10],
    ['SHUTDOWN_GRACE_MS', 0, 290000],
  ] as const) {
    if (
      env[key] !== undefined &&
      env[key] !== '' &&
      (!/^\d+$/.test(env[key]!) || Number(env[key]) < min || Number(env[key]) > max)
    )
      issues.push(`${key} must be an integer between ${min} and ${max}`);
  }
  if (production) {
    for (const key of ['SESSION_SECRET', 'ADMIN_TOKEN'])
      if ((env[key]?.length ?? 0) < 32) issues.push(`${key} must contain at least 32 characters`);
    if (!env.MONGODB_URI?.match(/^mongodb(?:\+srv)?:\/\//))
      issues.push('MONGODB_URI must be configured');
    for (const key of ['WEB_ORIGIN', 'API_ORIGIN']) {
      try {
        const url = new URL(env[key] || '');
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== '/'
        )
          throw new Error();
      } catch {
        issues.push(`${key} must be an HTTPS origin without a path or credentials`);
      }
    }
    if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET)
      issues.push('Configure both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither');
  }
  return issues;
}
